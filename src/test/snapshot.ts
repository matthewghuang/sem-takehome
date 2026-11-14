import { AS_OF_DATE } from '@/api/mockApi'
import type { Snapshot } from '@/data/fieldData'

export const snapshot: Snapshot = {
  version: 1,
  asOfDate: AS_OF_DATE,
  fetchedAt: '2027-01-16T10:00:00.000Z',
  fields: [
    { id: 'warm', name: 'Orchard', crop: 'Apples' },
    { id: 'cold', name: 'River', crop: 'Pears' },
  ],
  stations: [
    { id: 'warm', fieldId: 'warm', label: 'Hill' },
    { id: 'cold', fieldId: 'cold', label: 'Basin' },
  ],
  readings: [
    { stationId: 'warm', date: '2027-01-12', lowTempC: null },
    { stationId: 'warm', date: '2027-01-14', lowTempC: 4 },
    { stationId: 'warm', date: AS_OF_DATE, lowTempC: 5 },
    { stationId: 'cold', date: '2027-01-09', lowTempC: 0 },
    { stationId: 'cold', date: '2027-01-13', lowTempC: -2 },
  ],
}
