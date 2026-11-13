import { describe, expect, it } from 'vitest'
import { AS_OF_DATE } from '@/api/mockApi'
import type { Field, Reading, Station } from '@/api/mockApi'
import { summarizeFields } from './fieldSummary'

const field: Field = { id: 'f1', name: 'Orchard', crop: 'Apples' }
const station: Station = { id: 's1', fieldId: 'f1', label: 'North' }
const dates = [
  '2027-01-09', '2027-01-10', '2027-01-11', '2027-01-12',
  '2027-01-13', '2027-01-14', '2027-01-15',
]
const insufficient = {
  direction: 'insufficient', fromDate: null, toDate: null, deltaC: null,
}

function reading(stationId: string, date: string, lowTempC: number | null): Reading {
  return { stationId, date, lowTempC }
}

// Runtime freezing catches writes to input arrays and their entity objects.
function freezeInput<T extends object>(items: T[]): T[] {
  for (const item of items) Object.freeze(item)
  Object.freeze(items)
  return items
}

describe('summarizeFields', () => {
  it.each([
    [0, 'at-risk'],
    [-2, 'at-risk'],
    [0.5, 'no-frost-observed'],
  ])('classifies a minimum of %s°C as %s', (low, risk) => {
    const [summary] = summarizeFields([field], [station], [
      reading('s1', '2027-01-10', null),
      reading('s1', '2027-01-14', 4),
      reading('s1', '2027-01-15', low),
    ], AS_OF_DATE)
    expect(summary).toMatchObject({ coldestLowC: low, risk })
    expect(summary.stations[0].coldestLowC).toBe(low)
  })

  it('includes both window boundaries, excludes adjacent dates, and fills missing days', () => {
    const [summary] = summarizeFields([field], [station], [
      reading('s1', '2027-01-08', -20),
      reading('s1', '2027-01-09', 2),
      reading('s1', '2027-01-15', 3),
      reading('s1', '2027-01-16', -30),
    ], AS_OF_DATE)
    const dailyLows = dates.map((date, i) => ({
      date, lowTempC: i === 0 ? 2 : i === 6 ? 3 : null,
    }))
    expect(summary).toMatchObject({
      dailyLows, coldestLowC: 2, risk: 'no-frost-observed',
      trend: { direction: 'warming', fromDate: dates[0], toDate: dates[6], deltaC: 1 },
    })
    expect(summary.stations[0].dailyLows).toEqual(dailyLows)
    expect(summary.stations[0].coldestLowC).toBe(2)
  })

  it('uses the supplied date across year boundaries rather than the machine clock', () => {
    const [summary] = summarizeFields([field], [station], [
      reading('s1', '2026-12-26', -10),
      reading('s1', '2026-12-27', 0),
      reading('s1', '2027-01-01', 2),
      reading('s1', '2027-01-02', -10),
    ], '2027-01-02')
    expect(summary.dailyLows.map(({ date }) => date)).toEqual([
      '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30',
      '2026-12-31', '2027-01-01', '2027-01-02',
    ])
    expect(summary.coldestLowC).toBe(-10)
    expect(summary.stations[0].offline).toBe(false)
  })

  it('keeps fields and unrelated stations isolated without mutating any inputs', () => {
    const fields = freezeInput([
      { id: 'other', name: 'Other', crop: 'Pears' }, field,
    ])
    const stations = freezeInput([
      station,
      { id: 's2', fieldId: 'other', label: 'South' },
      { id: 'orphan', fieldId: 'absent', label: 'Outside' },
    ])
    const readings = freezeInput([
      reading('s2', '2027-01-15', -5),
      reading('s1', '2027-01-15', 2),
      reading('orphan', '2027-01-15', -100),
      reading('unknown', '2027-01-15', -200),
    ])
    const before = structuredClone({ fields, stations, readings })
    const summaries = summarizeFields(fields, stations, readings, AS_OF_DATE)
    expect(summaries.map(({ field, coldestLowC, stations }) => ({
      id: field.id, coldestLowC, stationIds: stations.map(({ station }) => station.id),
    }))).toEqual([
      { id: 'other', coldestLowC: -5, stationIds: ['s2'] },
      { id: 'f1', coldestLowC: 2, stationIds: ['s1'] },
    ])
    expect({ fields, stations, readings }).toEqual(before)
  })

  it.each([
    { history: 'missing', readings: [] },
    { history: 'null-only', readings: [reading('s1', '2027-01-15', null)] },
  ])(
    'treats $history histories as unknown, offline, and insufficient',
    ({ readings }) => {
      const [summary] = summarizeFields([field], [station], readings, AS_OF_DATE)
      const dailyLows = dates.map((date) => ({ date, lowTempC: null }))
      expect(summary).toMatchObject({
        coldestLowC: null, risk: 'unknown', trend: insufficient, dailyLows,
      })
      expect(summary.stations[0]).toMatchObject({
        coldestLowC: null, offline: true, trend: insufficient, dailyLows,
      })
    },
  )

  it('retains fields without stations as unknown and accepts an empty field list', () => {
    const [summary] = summarizeFields([field], [], [], AS_OF_DATE)
    expect(summary).toMatchObject({
      stations: [], risk: 'unknown', coldestLowC: null, trend: insufficient,
      dailyLows: dates.map((date) => ({ date, lowTempC: null })),
    })
    expect(summarizeFields([], [station], [reading('s1', dates[6], -3)], AS_OF_DATE)).toEqual([])
  })

  it.each([
    { date: '2027-01-14', low: 0, offline: false },
    { date: '2027-01-15', low: 0, offline: false },
    { date: '2027-01-14', low: 3, offline: false },
    { date: '2027-01-15', low: null, offline: true },
    { date: '2027-01-13', low: -3, offline: true },
  ])('sets offline=$offline for a $low report on $date', ({ date, low, offline }) => {
    const [summary] = summarizeFields([field], [station], [
      reading('s1', date, low),
    ], AS_OF_DATE)
    expect(summary.stations[0].offline).toBe(offline)
    expect(summary.stations[0].trend).toEqual(insufficient)
  })

  it.each([
    { older: 1, newer: 3, direction: 'warming', deltaC: 2 },
    { older: 3, newer: -1, direction: 'cooling', deltaC: -4 },
    { older: 0, newer: 0, direction: 'steady', deltaC: 0 },
  ])('uses the latest two actual reports for $direction trends', ({ older, newer, direction, deltaC }) => {
    const [summary] = summarizeFields([field], [station], [
      reading('s1', '2027-01-15', null),
      reading('s1', '2027-01-11', older),
      reading('s1', '2027-01-09', -10),
      reading('s1', '2027-01-14', newer),
    ], AS_OF_DATE)
    const trend = { direction, deltaC, fromDate: '2027-01-11', toDate: '2027-01-14' }
    expect(summary.trend).toEqual(trend)
    expect(summary.stations[0].trend).toEqual(trend)
    expect(summary.stations[0].coldestLowC).toBe(-10)
  })

  it('finds field cooling despite a warming station and changing reporting stations', () => {
    const [summary] = summarizeFields([field], [
      station, { id: 's2', fieldId: 'f1', label: 'South' },
    ], [
      reading('s1', '2027-01-11', 2),
      reading('s1', '2027-01-14', 4),
      reading('s2', '2027-01-14', -3),
    ], AS_OF_DATE)
    expect(summary).toMatchObject({ coldestLowC: -3, risk: 'at-risk' })
    expect(summary.dailyLows).toEqual(dates.map((date) => ({
      date, lowTempC: date === '2027-01-11' ? 2 : date === '2027-01-14' ? -3 : null,
    })))
    expect(summary.trend).toEqual({
      direction: 'cooling', fromDate: '2027-01-11', toDate: '2027-01-14', deltaC: -5,
    })
    expect(summary.stations.find(({ station }) => station.id === 's1')?.trend).toEqual({
      direction: 'warming', fromDate: '2027-01-11', toDate: '2027-01-14', deltaC: 2,
    })
    expect(summary.stations.find(({ station }) => station.id === 's1')?.dailyLows)
      .toEqual(dates.map((date) => ({
        date, lowTempC: date === '2027-01-11' ? 2 : date === '2027-01-14' ? 4 : null,
      })))
    expect(summary.stations.find(({ station }) => station.id === 's2')?.dailyLows)
      .toEqual(dates.map((date) => ({
        date, lowTempC: date === '2027-01-14' ? -3 : null,
      })))
  })

  it('sorts stations by minimum, then label and id, leaving nulls last and offline labels intact', () => {
    const stations: Station[] = [
      { id: 'null-z', fieldId: 'f1', label: 'Zulu' },
      { id: 'positive', fieldId: 'f1', label: 'Positive' },
      { id: 'tie-b', fieldId: 'f1', label: 'Alpha' },
      { id: 'zero', fieldId: 'f1', label: 'Zero' },
      { id: 'tie-z', fieldId: 'f1', label: 'Bravo' },
      { id: 'tie-a', fieldId: 'f1', label: 'Alpha' },
      { id: 'null-a', fieldId: 'f1', label: 'Alpha' },
    ]
    const [summary] = summarizeFields([field], stations, [
      reading('positive', dates[6], 2), reading('zero', dates[6], 0),
      reading('positive', dates[0], -4),
      reading('tie-b', dates[6], -3), reading('tie-z', dates[6], -3),
      reading('tie-a', dates[0], -3), reading('null-z', dates[6], null),
    ], AS_OF_DATE)
    expect(summary.stations.map(({ station, coldestLowC, offline }) => (
      [station.id, coldestLowC, offline]
    ))).toEqual([
      ['positive', -4, false],
      ['tie-a', -3, true], ['tie-b', -3, false], ['tie-z', -3, false],
      ['zero', 0, false],
      ['null-a', null, true], ['null-z', null, true],
    ])
  })

  it('sorts risk first, then all remaining fields together by name and id', () => {
    const fields: Field[] = [
      { id: 'f-z', name: 'Same', crop: 'Apples' },
      { id: 'risk-z', name: 'Zulu', crop: 'Apples' },
      { id: 'unknown', name: 'Alpha', crop: 'Apples' },
      { id: 'unknown-z', name: 'Zulu', crop: 'Apples' },
      { id: 'risk-b', name: 'Beta', crop: 'Apples' },
      { id: 'f-a', name: 'Same', crop: 'Apples' },
      { id: 'risk-a', name: 'Beta', crop: 'Apples' },
    ]
    const stations = fields.map(({ id }) => ({ id, fieldId: id, label: id }))
    const readings = [
      reading('f-z', dates[6], 2),
      reading('risk-z', dates[6], -5),
      reading('risk-b', dates[6], -3),
      reading('f-a', dates[6], 2),
      reading('risk-a', dates[6], -1),
    ]
    expect(summarizeFields(fields, stations, readings, AS_OF_DATE).map(({ field }) => field.id))
      .toEqual(['risk-a', 'risk-b', 'risk-z', 'unknown', 'f-a', 'f-z', 'unknown-z'])
  })
})
