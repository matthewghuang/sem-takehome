import { StrictMode } from 'react'
import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import type { Field, Reading } from '@/api/mockApi'
import { fieldSnapshotQueryOptions, readSavedSnapshot, saveSnapshot } from '@/data/fieldData'
import type { Snapshot } from '@/data/fieldData'
import { createFieldQueryClient } from '@/data/queryClient'
import { useFieldData } from './useFieldData'
import type { FieldData } from './useFieldData'

vi.mock(import('@/api/mockApi'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getFields: vi.fn(), getStations: vi.fn(), getReadings: vi.fn() }
})

const storageKey = 'frost-indicator:field-snapshot:v1:2027-01-15'
const saved: Snapshot = {
  version: 1,
  asOfDate: AS_OF_DATE,
  fetchedAt: '2027-01-16T10:00:00.000Z',
  fields: [
    { id: 'f1', name: 'Orchard', crop: 'Apples' },
    { id: 'f2', name: 'River', crop: 'Pears' },
  ],
  stations: [
    { id: 's1', fieldId: 'f1', label: 'North' },
    { id: 's2', fieldId: 'f2', label: 'South' },
  ],
  readings: [
    { stationId: 's1', date: AS_OF_DATE, lowTempC: 3 },
    { stationId: 's2', date: '2027-01-14', lowTempC: -2 },
    { stationId: 's2', date: AS_OF_DATE, lowTempC: -1 },
  ],
}
const changedReadings: Reading[] = [
  { stationId: 's1', date: AS_OF_DATE, lowTempC: 8 },
  { stationId: 's2', date: AS_OF_DATE, lowTempC: -5 },
]
const failure = new Error('Network request failed')
let client: QueryClient

// ES2023 is the project's library target, so Promise.withResolvers is unavailable.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function Wrapper({ children }: PropsWithChildren) {
  return <StrictMode><QueryClientProvider client={client}>{children}</QueryClientProvider></StrictMode>
}

async function settle() {
  await act(async () => { await vi.runAllTimersAsync() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-02-01T12:00:00.000Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0)
  window.localStorage.clear()
  vi.mocked(getFields).mockReset().mockResolvedValue(saved.fields)
  vi.mocked(getStations).mockReset().mockResolvedValue(saved.stations)
  vi.mocked(getReadings).mockReset().mockResolvedValue(saved.readings)
  client = createFieldQueryClient()
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('useFieldData', () => {
  it('hydrates the first render once and shares the background request across remounts', async () => {
    saveSnapshot(saved)
    client.clear()
    const storageReads = vi.spyOn(Storage.prototype, 'getItem')
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem')
    client = createFieldQueryClient()
    expect(client.getQueryState(fieldSnapshotQueryOptions.queryKey)?.dataUpdatedAt)
      .toBe(Date.parse(saved.fetchedAt))
    expect(storageWrites).not.toHaveBeenCalled()
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const renders: FieldData[] = []
    const first = renderHook(() => {
      const data = useFieldData()
      renders.push(data)
      return data
    }, { wrapper: Wrapper })

    expect(renders[0]).toMatchObject({
      fetchedAt: saved.fetchedAt, isRefreshing: true, error: null,
      fields: [
        { field: { id: 'f2' }, coldestLowC: -2, risk: 'at-risk' },
        { field: { id: 'f1' }, coldestLowC: 3, risk: 'no-frost-observed' },
      ],
    })
    const initialFields = first.result.current.fields
    first.rerender()
    expect(first.result.current.fields).toBe(initialFields)
    first.unmount()
    const second = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(second.result.current.fetchedAt).toBe(saved.fetchedAt)
    expect(storageReads).toHaveBeenCalledExactlyOnceWith(storageKey)
    expect(getFields).toHaveBeenCalledTimes(1)
    expect(storageWrites).not.toHaveBeenCalled()

    pending.resolve(saved.fields)
    await settle()
    expect(second.result.current.isRefreshing).toBe(false)
    expect(second.result.current.fetchedAt).toBe('2030-02-01T12:00:00.000Z')
    expect(storageWrites).toHaveBeenCalledTimes(1)
    expect(storageReads).toHaveBeenCalledTimes(1)
  })

  it('distinguishes initial loading from exhausted failure and recovers on manual Retry', async () => {
    vi.mocked(getFields).mockRejectedValue(failure)
    const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(result.current).toMatchObject({
      fields: null, fetchedAt: null, isRefreshing: true, error: null,
    })
    await settle()
    expect(result.current).toMatchObject({
      fields: null, fetchedAt: null, isRefreshing: false,
      error: 'Field data is currently unavailable. Please retry.',
    })
    expect(getFields).toHaveBeenCalledTimes(4)
    expect(readSavedSnapshot()).toBeNull()

    vi.mocked(getFields).mockResolvedValue(saved.fields)
    act(() => result.current.refresh())
    await settle()
    expect(result.current).toMatchObject({ isRefreshing: false, error: null })
    expect(result.current.fields?.map(({ field }) => field.id)).toEqual(['f2', 'f1'])
    expect(getFields).toHaveBeenCalledTimes(5)
    expect(readSavedSnapshot()?.fields).toEqual(saved.fields)
  })

  it('retains saved summaries and timestamp after failure, then replaces both after Retry', async () => {
    saveSnapshot(saved)
    client.clear()
    client = createFieldQueryClient()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(getReadings).mockRejectedValue(failure)
    const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    const initialFields = result.current.fields
    await settle()
    expect(result.current).toMatchObject({
      fetchedAt: saved.fetchedAt, isRefreshing: false,
      error: 'Could not refresh. Showing last successfully loaded data.',
    })
    expect(result.current.fields).toBe(initialFields)
    expect(readSavedSnapshot()).toEqual(saved)
    expect(writes).not.toHaveBeenCalled()
    expect(getReadings).toHaveBeenCalledTimes(4)

    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    act(() => result.current.refresh())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current).toMatchObject({ isRefreshing: true, error: null, fetchedAt: saved.fetchedAt })
    expect(result.current.fields).toBe(initialFields)
    pending.resolve(changedReadings)
    await settle()

    expect(result.current).toMatchObject({
      isRefreshing: false, error: null,
      fields: [
        { field: { id: 'f2' }, coldestLowC: -5 },
        { field: { id: 'f1' }, coldestLowC: 8 },
      ],
    })
    expect(result.current.fields).not.toBe(initialFields)
    expect(result.current.fetchedAt).not.toBe(saved.fetchedAt)
    expect(readSavedSnapshot()).toEqual({
      ...saved, fetchedAt: result.current.fetchedAt, readings: changedReadings,
    })
    expect(writes).toHaveBeenCalledTimes(1)
  })

  it('replaces cached rows with an authoritative empty snapshot', async () => {
    saveSnapshot(saved)
    client.clear()
    client = createFieldQueryClient()
    vi.mocked(getFields).mockResolvedValue([])
    const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(result.current.fields?.map(({ field }) => field.id)).toEqual(['f2', 'f1'])
    await settle()
    expect(result.current).toMatchObject({ fields: [], isRefreshing: false, error: null })
    expect(readSavedSnapshot()).toEqual({
      version: 1, asOfDate: AS_OF_DATE, fetchedAt: '2030-02-01T12:00:00.000Z',
      fields: [], stations: [], readings: [],
    })
    expect(getStations).not.toHaveBeenCalled()
    expect(getReadings).not.toHaveBeenCalled()
  })

  it('deduplicates StrictMode consumers and repeated Refresh calls before a rerender', async () => {
    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const first = renderHook(() => useFieldData(), { wrapper: Wrapper })
    const second = renderHook(() => useFieldData(), { wrapper: Wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => {
      first.result.current.refresh()
      first.result.current.refresh()
      second.result.current.refresh()
    })
    expect(getFields).toHaveBeenCalledTimes(1)
    expect(getStations).toHaveBeenCalledTimes(1)
    expect(getReadings).toHaveBeenCalledTimes(1)
    expect(writes).not.toHaveBeenCalled()
    first.unmount()
    pending.resolve(saved.readings)
    await settle()
    expect(second.result.current.fields?.map(({ field }) => field.id)).toEqual(['f2', 'f1'])
    expect(writes).toHaveBeenCalledTimes(1)

    const next = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(next.promise)
    act(() => {
      second.result.current.refresh()
      second.result.current.refresh()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getFields).toHaveBeenCalledTimes(2)
    expect(getStations).toHaveBeenCalledTimes(2)
    expect(getReadings).toHaveBeenCalledTimes(2)
    next.resolve(changedReadings)
    await settle()
    expect(second.result.current.fields?.[0].coldestLowC).toBe(-5)
    expect(writes).toHaveBeenCalledTimes(2)
  })

  it('finishes and saves a request after every observer unmounts', async () => {
    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    const { unmount } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    unmount()
    pending.resolve(changedReadings)
    await settle()
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toEqual({
      ...saved, fetchedAt: '2030-02-01T12:00:00.000Z', readings: changedReadings,
    })
    expect(readSavedSnapshot()?.readings).toEqual(changedReadings)
    const remount = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(remount.result.current.fields?.[0].coldestLowC).toBe(-5)
    expect(remount.result.current.isRefreshing).toBe(true)
    await settle()
  })

  it.each(['access', 'read', 'write'] as const)(
    'loads and retains in-memory data when storage %s is unavailable',
    async (operation) => {
      const unavailable = () => { throw new DOMException('Storage unavailable', 'SecurityError') }
      if (operation === 'access') vi.spyOn(window, 'localStorage', 'get').mockImplementation(unavailable)
      if (operation === 'read') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable)
      if (operation === 'write') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable)
      client.clear()
      client = createFieldQueryClient()
      const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
      expect(result.current.fields).toBeNull()
      await settle()
      expect(result.current).toMatchObject({ isRefreshing: false, error: null })
      expect(result.current.fields?.[0].coldestLowC).toBe(-2)
      expect(getFields).toHaveBeenCalledTimes(1)
      const loadedFields = result.current.fields
      const fetchedAt = result.current.fetchedAt
      vi.mocked(getReadings).mockRejectedValue(failure)
      act(() => result.current.refresh())
      await settle()
      expect(result.current.fields).toBe(loadedFields)
      expect(result.current.fetchedAt).toBe(fetchedAt)
      expect(result.current.error).toBe('Could not refresh. Showing last successfully loaded data.')
    },
  )

  it.each([
    '{',
    JSON.stringify({ ...saved, version: 2 }),
    JSON.stringify({ ...saved, asOfDate: '2027-01-14' }),
  ])('ignores invalid persisted data and fetches normally: %s', async (raw) => {
    window.localStorage.setItem(storageKey, raw)
    client.clear()
    client = createFieldQueryClient()
    const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(result.current.fields).toBeNull()
    await settle()
    expect(result.current).toMatchObject({ isRefreshing: false, error: null })
    expect(result.current.fields?.[0].coldestLowC).toBe(-2)
    expect(readSavedSnapshot()?.readings).toEqual(saved.readings)
    expect(getFields).toHaveBeenCalledTimes(1)
  })

  it('retains hydrated data while the first observer mounts after the usual cache GC interval', async () => {
    saveSnapshot(saved)
    client.clear()
    client = createFieldQueryClient()
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useFieldData(), { wrapper: Wrapper })
    expect(result.current.fetchedAt).toBe(saved.fetchedAt)
    expect(result.current.fields?.[0].coldestLowC).toBe(-2)
    expect(result.current.isRefreshing).toBe(true)
    pending.resolve(saved.fields)
    await settle()
  })
})

describe('snapshot success persistence', () => {
  it('ignores unrelated queries and manual/status updates, saving only complete network successes', async () => {
    saveSnapshot(saved)
    client.clear()
    client = createFieldQueryClient()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await client.query({ queryKey: ['unrelated'], queryFn: async () => saved })
    client.setQueryData(fieldSnapshotQueryOptions.queryKey, { ...saved, fetchedAt: '2029-01-01T00:00:00Z' })
    await client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey, refetchType: 'none' })
    expect(writes).not.toHaveBeenCalled()
    expect(readSavedSnapshot()).toEqual(saved)

    vi.mocked(getReadings).mockResolvedValue(changedReadings)
    const fresh = await client.query(fieldSnapshotQueryOptions)
    expect(readSavedSnapshot()).toEqual(fresh)
    expect(writes).toHaveBeenCalledTimes(1)
    vi.mocked(getReadings).mockRejectedValue(failure)
    const rejected = expect(client.query(fieldSnapshotQueryOptions)).rejects.toBe(failure)
    await settle()
    await rejected
    expect(readSavedSnapshot()).toEqual(fresh)
    expect(writes).toHaveBeenCalledTimes(1)
  })
})
