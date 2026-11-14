import { expect, it } from 'vitest'
import { AS_OF_DATE } from '@/api/mockApi'
import type { Field, Reading, Station } from '@/api/mockApi'
import { summarizeFields } from './fieldSummary'

function reading(stationId: string, date: string, lowTempC: number | null): Reading {
  return { stationId, date, lowTempC }
}

it('classifies frost within the seven-day window', () => {
  const fields: Field[] = [
    { id: 'start', name: 'Start', crop: 'Apples' },
    { id: 'end', name: 'End', crop: 'Apples' },
    { id: 'positive', name: 'Positive', crop: 'Pears' },
    { id: 'missing', name: 'Missing', crop: 'Pears' },
  ]
  const stations: Station[] = [
    { id: 'start', fieldId: 'start', label: 'Start' },
    { id: 'end', fieldId: 'end', label: 'End' },
    { id: 'positive', fieldId: 'positive', label: 'Positive' },
    { id: 'missing', fieldId: 'missing', label: 'Missing' },
    { id: 'orphan', fieldId: 'absent', label: 'Outside' },
  ]
  const summaries = summarizeFields(fields, stations, [
    reading('start', '2027-01-09', 0),
    reading('start', '2027-01-15', 2),
    reading('end', '2027-01-09', 3),
    reading('end', '2027-01-15', -1),
    reading('positive', '2027-01-08', -20),
    reading('positive', '2027-01-09', 2),
    reading('positive', '2027-01-15', 3),
    reading('positive', '2027-01-16', -30),
    reading('missing', '2027-01-15', null),
    reading('orphan', '2027-01-15', -100),
    reading('unknown', '2027-01-15', -200),
  ], AS_OF_DATE)

  expect(summaries.map(({ field, coldestLowC, risk }) => (
    [field.id, coldestLowC, risk]
  ))).toEqual([
    ['end', -1, 'at-risk'],
    ['start', 0, 'at-risk'],
    ['missing', null, 'unknown'],
    ['positive', 2, 'no-frost-observed'],
  ])
})

it('summarizes trends and cold offline stations', () => {
  const field: Field = { id: 'orchard', name: 'Orchard', crop: 'Apples' }
  const stations: Station[] = [
    { id: 'missing', fieldId: field.id, label: 'Missing' },
    { id: 'warming', fieldId: field.id, label: 'Warming' },
    { id: 'zero', fieldId: field.id, label: 'Zero' },
    { id: 'cold', fieldId: field.id, label: 'Cold' },
  ]
  const [summary] = summarizeFields([field], stations, [
    reading('warming', '2027-01-11', 2),
    reading('warming', '2027-01-14', 4),
    reading('cold', '2027-01-09', -6),
    reading('cold', '2027-01-11', 5),
    reading('zero', '2027-01-14', 0),
    reading('missing', '2027-01-15', null),
  ], AS_OF_DATE)

  expect(summary.dailyLows.map(({ lowTempC }) => lowTempC))
    .toEqual([-6, null, 2, null, null, 0, null])
  expect(summary.trend).toEqual({
    direction: 'cooling', fromDate: '2027-01-11', toDate: '2027-01-14', deltaC: -2,
  })
  expect(summary.stations.find(({ station }) => station.id === 'warming')?.trend)
    .toEqual({
      direction: 'warming', fromDate: '2027-01-11', toDate: '2027-01-14', deltaC: 2,
    })
  expect(summary.stations.map(({ station, coldestLowC, offline }) => (
    [station.id, coldestLowC, offline]
  ))).toEqual([
    ['cold', -6, true],
    ['zero', 0, false],
    ['warming', 2, false],
    ['missing', null, true],
  ])
})
