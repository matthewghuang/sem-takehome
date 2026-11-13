import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import type { Field, Reading, Station } from '@/api/mockApi'
import { fieldSnapshotQueryOptions } from './fieldData'

vi.mock(import('@/api/mockApi'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getFields: vi.fn(),
    getStations: vi.fn(),
    getReadings: vi.fn(),
  }
})

const fields: Field[] = [
  { id: 'f1', name: 'Orchard', crop: 'Apples' },
  { id: 'f2', name: 'Vineyard', crop: 'Grapes' },
]
const stations: Station[] = [
  { id: 's1', fieldId: 'f1', label: 'North' },
  { id: 's2', fieldId: 'f2', label: 'South' },
]
const readings: Reading[] = [
  { stationId: 's1', date: '2027-01-09', lowTempC: -2 },
  { stationId: 's2', date: '2027-01-15', lowTempC: null },
]
const failure = new Error('Network request failed')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-02-01T12:00:00.000Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.mocked(getFields).mockReset().mockResolvedValue(fields)
  vi.mocked(getStations).mockReset().mockResolvedValue(stations)
  vi.mocked(getReadings).mockReset().mockResolvedValue(readings)
  client = new QueryClient()
})

afterEach(() => {
  client.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('field snapshot query', () => {
  it('loads endpoints sequentially with batched ids and publishes only the complete snapshot', async () => {
    const pendingFields = deferred<Field[]>()
    const pendingStations = deferred<Station[]>()
    const pendingReadings = deferred<Reading[]>()
    vi.mocked(getFields).mockReturnValueOnce(pendingFields.promise)
    vi.mocked(getStations).mockReturnValueOnce(pendingStations.promise)
    vi.mocked(getReadings).mockReturnValueOnce(pendingReadings.promise)

    const result = client.query(fieldSnapshotQueryOptions)
    expect(getFields).toHaveBeenCalledExactlyOnceWith()
    expect(getStations).not.toHaveBeenCalled()
    expect(getReadings).not.toHaveBeenCalled()
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()

    pendingFields.resolve(fields)
    await vi.advanceTimersByTimeAsync(0)
    expect(getStations).toHaveBeenCalledExactlyOnceWith(['f1', 'f2'])
    expect(getReadings).not.toHaveBeenCalled()
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()

    pendingStations.resolve(stations)
    await vi.advanceTimersByTimeAsync(0)
    expect(getReadings).toHaveBeenCalledExactlyOnceWith(
      ['s1', 's2'], '2027-01-09', AS_OF_DATE,
    )
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1500)
    pendingReadings.resolve(readings)
    const expected = {
      version: 1,
      asOfDate: AS_OF_DATE,
      fetchedAt: '2030-02-01T12:00:01.500Z',
      fields,
      stations,
      readings,
    }
    await expect(result).resolves.toEqual(expected)
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toEqual(expected)
  })

  it('skips stations and readings for an authoritative empty field result', async () => {
    vi.mocked(getFields).mockResolvedValue([])
    const snapshot = await client.query(fieldSnapshotQueryOptions)
    expect(snapshot).toEqual({
      version: 1, asOfDate: AS_OF_DATE, fetchedAt: '2030-02-01T12:00:00.000Z',
      fields: [], stations: [], readings: [],
    })
    expect(getStations).not.toHaveBeenCalled()
    expect(getReadings).not.toHaveBeenCalled()
  })

  it('retains fields without stations and skips readings', async () => {
    vi.mocked(getStations).mockResolvedValue([])
    const snapshot = await client.query(fieldSnapshotQueryOptions)
    expect(snapshot).toEqual({
      version: 1, asOfDate: AS_OF_DATE, fetchedAt: '2030-02-01T12:00:00.000Z',
      fields, stations: [], readings: [],
    })
    expect(getStations).toHaveBeenCalledExactlyOnceWith(['f1', 'f2'])
    expect(getReadings).not.toHaveBeenCalled()
  })

  it('recovers from a rejected readings request by restarting the entire pipeline', async () => {
    const replacementFields: Field[] = [{ id: 'new-field', name: 'New orchard', crop: 'Pears' }]
    const replacementStations: Station[] = [
      { id: 'new-station', fieldId: 'new-field', label: 'East' },
    ]
    const replacementReadings: Reading[] = [
      { stationId: 'new-station', date: AS_OF_DATE, lowTempC: 1 },
    ]
    vi.mocked(getFields).mockResolvedValueOnce(fields).mockResolvedValue(replacementFields)
    vi.mocked(getStations).mockResolvedValueOnce(stations).mockResolvedValue(replacementStations)
    vi.mocked(getReadings).mockRejectedValueOnce(failure).mockResolvedValue(replacementReadings)

    const result = client.query(fieldSnapshotQueryOptions)
    await vi.advanceTimersByTimeAsync(0)
    expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1000)

    await expect(result).resolves.toEqual({
      version: 1, asOfDate: AS_OF_DATE, fetchedAt: '2030-02-01T12:00:01.000Z',
      fields: replacementFields, stations: replacementStations, readings: replacementReadings,
    })
    expect(getFields).toHaveBeenCalledTimes(2)
    expect(getStations).toHaveBeenNthCalledWith(1, ['f1', 'f2'])
    expect(getStations).toHaveBeenNthCalledWith(2, ['new-field'])
    expect(getStations).toHaveBeenCalledTimes(2)
    expect(getReadings).toHaveBeenNthCalledWith(1, ['s1', 's2'], '2027-01-09', AS_OF_DATE)
    expect(getReadings).toHaveBeenNthCalledWith(2, ['new-station'], '2027-01-09', AS_OF_DATE)
    expect(getReadings).toHaveBeenCalledTimes(2)
    expect(client.getQueryState(fieldSnapshotQueryOptions.queryKey)?.status).toBe('success')
  })

  it.each(['fields', 'stations', 'readings'] as const)(
    'stops after four attempts when %s fails, without publishing partial data or polling',
    async (endpoint) => {
      if (endpoint === 'fields') vi.mocked(getFields).mockRejectedValue(failure)
      if (endpoint === 'stations') vi.mocked(getStations).mockRejectedValue(failure)
      if (endpoint === 'readings') vi.mocked(getReadings).mockRejectedValue(failure)
      const result = client.query(fieldSnapshotQueryOptions)
      const rejected = expect(result).rejects.toBe(failure)
      await vi.advanceTimersByTimeAsync(7000)
      await rejected

      expect(getFields).toHaveBeenCalledTimes(4)
      expect(getStations).toHaveBeenCalledTimes(endpoint === 'fields' ? 0 : 4)
      expect(getReadings).toHaveBeenCalledTimes(endpoint === 'readings' ? 4 : 0)
      expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()
      expect(client.getQueryState(fieldSnapshotQueryOptions.queryKey)).toMatchObject({
        status: 'error', fetchStatus: 'idle', error: failure,
      })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getFields).toHaveBeenCalledTimes(4)
    },
  )

  it.each([
    { random: 0, jitter: 0 },
    { random: 0.5, jitter: 125 },
    { random: 1 - Number.EPSILON, jitter: 250 },
  ])('waits 1/2/4 seconds plus $jitter ms before retries', async ({ random, jitter }) => {
    vi.mocked(Math.random).mockReturnValue(random)
    vi.mocked(getReadings).mockRejectedValue(failure)
    const result = client.query(fieldSnapshotQueryOptions)
    const rejected = expect(result).rejects.toBe(failure)
    await vi.advanceTimersByTimeAsync(0)

    for (const [retryIndex, baseDelay] of [1000, 2000, 4000].entries()) {
      await vi.advanceTimersByTimeAsync(baseDelay + jitter - 1)
      expect(getFields).toHaveBeenCalledTimes(retryIndex + 1)
      expect(getReadings).toHaveBeenCalledTimes(retryIndex + 1)
      expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(getFields).toHaveBeenCalledTimes(retryIndex + 2)
      expect(getReadings).toHaveBeenCalledTimes(retryIndex + 2)
    }
    await rejected
  })
})
