import { afterEach, expect, it, vi } from 'vitest'
import { snapshot } from '@/test/snapshot'
import { readSavedSnapshot, saveSnapshot } from './fieldData'

const storageKey = 'frost-indicator:field-snapshot:v1:2027-01-15'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

it('rejects broken saved relationships', () => {
  saveSnapshot(snapshot)
  expect(readSavedSnapshot()).toEqual(snapshot)

  window.localStorage.setItem(storageKey, JSON.stringify({
    ...snapshot,
    stations: snapshot.stations.map((station) => ({ ...station, fieldId: 'missing-field' })),
  }))

  expect(readSavedSnapshot()).toBeNull()
})

it('survives failed cache writes', () => {
  saveSnapshot(snapshot)
  const changed = {
    ...snapshot,
    readings: snapshot.readings.map((reading) => ({ ...reading, lowTempC: -6 })),
  }
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage full', 'QuotaExceededError')
  })

  saveSnapshot(changed)
  expect(readSavedSnapshot()).toEqual(snapshot)
})
