import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import { fieldSnapshotQueryOptions, readSavedSnapshot, saveSnapshot } from './fieldData'
import type { Snapshot } from './fieldData'

vi.mock(import('@/api/mockApi'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getFields: vi.fn(), getStations: vi.fn(), getReadings: vi.fn() }
})

// A literal key catches accidental changes to the persisted namespace/date/version.
const storageKey = 'frost-indicator:field-snapshot:v1:2027-01-15'
const validSnapshot: Snapshot = {
  version: 1,
  asOfDate: AS_OF_DATE,
  fetchedAt: '2027-01-16T10:30:00.000Z',
  fields: [
    { id: 'f1', name: 'Orchard', crop: 'Apples' },
    { id: 'f2', name: 'Vineyard', crop: 'Grapes' },
  ],
  stations: [
    { id: 's1', fieldId: 'f1', label: 'North' },
    { id: 's2', fieldId: 'f2', label: 'South' },
  ],
  readings: [
    { stationId: 's1', date: '2027-01-09', lowTempC: -2 },
    { stationId: 's1', date: '2027-01-15', lowTempC: 0 },
    { stationId: 's2', date: '2027-01-14', lowTempC: null },
    { stationId: 's2', date: '2027-01-15', lowTempC: 0.5 },
  ],
}

let snapshot: Snapshot
let client: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-02-01T12:00:00.000Z'))
  window.localStorage.clear()
  snapshot = structuredClone(validSnapshot)
  vi.mocked(getFields).mockReset().mockResolvedValue(snapshot.fields)
  vi.mocked(getStations).mockReset().mockResolvedValue(snapshot.stations)
  vi.mocked(getReadings).mockReset().mockResolvedValue(snapshot.readings)
  client = new QueryClient()
})

afterEach(() => {
  client.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('saved snapshots', () => {
  it('round-trips raw data, including null and zero, without expiring fixed-date observations', () => {
    saveSnapshot(snapshot)
    expect(window.localStorage.getItem(storageKey)).toBe(JSON.stringify(snapshot))
    expect(readSavedSnapshot()).toEqual(snapshot)
  })

  it('returns no snapshot when storage is empty or only another reference date is saved', () => {
    expect(readSavedSnapshot()).toBeNull()
    window.localStorage.setItem(
      'frost-indicator:field-snapshot:v1:2027-01-14', JSON.stringify(snapshot),
    )
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each([
    '{', 'null', '[]', 'false', '42', '"snapshot"',
    '{"error":"Network request failed"}',
  ])('ignores malformed JSON or a non-snapshot value: %s', (saved) => {
    window.localStorage.setItem(storageKey, saved)
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each([
    { reason: 'missing version', patch: { version: undefined } },
    { reason: 'wrong version', patch: { version: 2 } },
    { reason: 'string version', patch: { version: '1' } },
    { reason: 'missing reference date', patch: { asOfDate: undefined } },
    { reason: 'wrong reference date', patch: { asOfDate: '2027-01-14' } },
    { reason: 'non-string reference date', patch: { asOfDate: 20270115 } },
    { reason: 'missing fetch time', patch: { fetchedAt: undefined } },
    { reason: 'invalid fetch time', patch: { fetchedAt: 'not a timestamp' } },
    { reason: 'empty fetch time', patch: { fetchedAt: '' } },
    { reason: 'non-string fetch time', patch: { fetchedAt: 1800000000000 } },
  ])('ignores a snapshot with $reason', ({ patch }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...snapshot, ...patch }))
    expect(readSavedSnapshot()).toBeNull()
  })

  describe.each(['fields', 'stations', 'readings'] as const)('%s collection', (collection) => {
    it.each([undefined, null, {}])('rejects a missing or non-array collection: %s', (value) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ ...snapshot, [collection]: value }))
      expect(readSavedSnapshot()).toBeNull()
    })

    it.each([null, 1, [], {}])('rejects a malformed entity: %s', (value) => {
      const saved = { ...snapshot, [collection]: [...snapshot[collection], value] }
      window.localStorage.setItem(storageKey, JSON.stringify(saved))
      expect(readSavedSnapshot()).toBeNull()
    })
  })

  describe.each([
    { collection: 'fields', property: 'id' },
    { collection: 'fields', property: 'name' },
    { collection: 'fields', property: 'crop' },
    { collection: 'stations', property: 'id' },
    { collection: 'stations', property: 'fieldId' },
    { collection: 'stations', property: 'label' },
    { collection: 'readings', property: 'stationId' },
  ] as const)('$collection.$property', ({ collection, property }) => {
    it.each([undefined, null, 0, ''])('rejects a missing, empty, or non-string value: %s', (value) => {
      const entities = snapshot[collection].map((entity, index) => (
        index === 0 ? { ...entity, [property]: value } : entity
      ))
      window.localStorage.setItem(storageKey, JSON.stringify({ ...snapshot, [collection]: entities }))
      expect(readSavedSnapshot()).toBeNull()
    })
  })

  it.each(['fields', 'stations'] as const)('rejects duplicate %s ids', (collection) => {
    const saved = { ...snapshot, [collection]: [...snapshot[collection], snapshot[collection][0]] }
    window.localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(readSavedSnapshot()).toBeNull()
  })

  it('rejects a station whose field does not exist', () => {
    snapshot.stations[1].fieldId = 'missing-field'
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
    expect(readSavedSnapshot()).toBeNull()
  })

  it('rejects a reading whose station does not exist', () => {
    snapshot.readings[1].stationId = 'missing-station'
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each([
    undefined, null, 20270115, '', 'not a date', '2027-1-09', '2027-02-29',
    '2027-02-30', '2027-04-31', '2027-13-01', '2027-01-00', '2027-01-32',
    '2027-01-15T00:00:00Z',
  ])('rejects a non-ISO or impossible reading date: %s', (date) => {
    const saved = {
      ...snapshot,
      readings: snapshot.readings.map((reading, index) => index === 0 ? { ...reading, date } : reading),
    }
    window.localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each([undefined, '0', true, {}])('rejects a non-numeric, non-null temperature: %s', (lowTempC) => {
    const saved = {
      ...snapshot,
      readings: snapshot.readings.map((reading, index) => (
        index === 0 ? { ...reading, lowTempC } : reading
      )),
    }
    window.localStorage.setItem(storageKey, JSON.stringify(saved))
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each(['1e400', '-1e400'])('rejects a nonfinite temperature parsed from JSON: %s', (temperature) => {
    // JSON.stringify would turn Infinity into null, so preserve the overflowing JSON number.
    const saved = JSON.stringify(snapshot).replace('"lowTempC":-2', `"lowTempC":${temperature}`)
    window.localStorage.setItem(storageKey, saved)
    expect(readSavedSnapshot()).toBeNull()
  })

  it.each([NaN, Infinity, -Infinity])('does not overwrite saved observations with %s', (temperature) => {
    saveSnapshot(snapshot)
    const invalid = structuredClone(snapshot)
    invalid.readings[0].lowTempC = temperature
    saveSnapshot(invalid)
    expect(readSavedSnapshot()).toEqual(snapshot)
  })

  it('keeps the previous snapshot when serialization fails', () => {
    saveSnapshot(snapshot)
    const circular = Object.assign(structuredClone(snapshot), { extra: null as unknown })
    circular.extra = circular
    saveSnapshot(circular)
    expect(readSavedSnapshot()).toEqual(snapshot)
  })

  it.each(['access', 'read', 'write'] as const)(
    'keeps a successful in-memory query usable when storage %s throws',
    async (operation) => {
      const storage = window.localStorage
      saveSnapshot(snapshot)
      const unavailable = () => { throw new DOMException('Storage unavailable', 'SecurityError') }
      if (operation === 'access') vi.spyOn(window, 'localStorage', 'get').mockImplementation(unavailable)
      if (operation === 'read') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable)
      if (operation === 'write') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable)

      expect(readSavedSnapshot()).toEqual(operation === 'write' ? snapshot : null)
      const fresh = await client.query(fieldSnapshotQueryOptions)
      saveSnapshot(fresh)
      expect(client.getQueryData(fieldSnapshotQueryOptions.queryKey)).toEqual(fresh)
      expect(fresh.fetchedAt).toBe('2030-02-01T12:00:00.000Z')
      expect(getFields).toHaveBeenCalledTimes(1)
      expect(getStations).toHaveBeenCalledTimes(1)
      expect(getReadings).toHaveBeenCalledTimes(1)

      vi.restoreAllMocks()
      expect(JSON.parse(storage.getItem(storageKey)!)).toEqual(operation === 'read' ? fresh : snapshot)
    },
  )

  it('replaces an older populated snapshot with a successful empty query result', async () => {
    saveSnapshot(snapshot)
    vi.mocked(getFields).mockResolvedValue([])
    const empty = await client.query(fieldSnapshotQueryOptions)
    saveSnapshot(empty)
    expect(readSavedSnapshot()).toEqual({
      version: 1, asOfDate: AS_OF_DATE, fetchedAt: '2030-02-01T12:00:00.000Z',
      fields: [], stations: [], readings: [],
    })
    expect(getStations).not.toHaveBeenCalled()
    expect(getReadings).not.toHaveBeenCalled()
  })
})
