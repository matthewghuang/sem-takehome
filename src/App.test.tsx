import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { act, cleanup, configure, getConfig, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import type { Field, Reading } from '@/api/mockApi'
import { fieldSnapshotQueryOptions, readSavedSnapshot, saveSnapshot } from '@/data/fieldData'
import type { Snapshot } from '@/data/fieldData'
import { createFieldQueryClient } from '@/data/queryClient'
import App from './App'

vi.mock(import('@/api/mockApi'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getFields: vi.fn(), getStations: vi.fn(), getReadings: vi.fn() }
})

const snapshot: Snapshot = {
  version: 1,
  asOfDate: AS_OF_DATE,
  fetchedAt: '2027-01-16T10:00:00.000Z',
  fields: [
    { id: 'warm', name: 'Apple Orchard', crop: 'Apples' },
    { id: 'frost', name: 'River Flats', crop: 'Pears' },
    { id: 'unknown', name: 'No stations', crop: 'Grapes' },
  ],
  stations: [
    { id: 'warm-1', fieldId: 'warm', label: 'Hill' },
    { id: 'frost-1', fieldId: 'frost', label: 'North' },
    { id: 'frost-2', fieldId: 'frost', label: 'South' },
  ],
  readings: [
    { stationId: 'warm-1', date: '2027-01-11', lowTempC: 4 },
    { stationId: 'warm-1', date: '2027-01-14', lowTempC: 5 },
    { stationId: 'warm-1', date: AS_OF_DATE, lowTempC: 5 },
    { stationId: 'frost-1', date: '2027-01-14', lowTempC: 2 },
    { stationId: 'frost-1', date: AS_OF_DATE, lowTempC: 4 },
    { stationId: 'frost-2', date: '2027-01-14', lowTempC: 0 },
    { stationId: 'frost-2', date: AS_OF_DATE, lowTempC: -3 },
  ],
}
const changedReadings: Reading[] = [
  { stationId: 'warm-1', date: AS_OF_DATE, lowTempC: 10 },
  { stationId: 'frost-2', date: AS_OF_DATE, lowTempC: -6 },
]
const failure = new Error('Network request failed')
let client: QueryClient

// The project's ES2023 library target predates Promise.withResolvers.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function renderDashboard() {
  return render(
    <StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>,
  )
}

async function settle() {
  await act(async () => { await vi.runAllTimersAsync() })
}

const originalAsyncWrapper = getConfig().asyncWrapper

beforeEach(() => {
  vi.useFakeTimers()
  // RTL's default async wrapper advances Jest timers only; user-event advances Vitest timers.
  configure({
    asyncWrapper: async <T,>(callback: () => Promise<T>) => {
      let result!: T
      await act(async () => { result = await callback() })
      return result
    },
  })
  vi.setSystemTime(new Date('2030-02-01T12:00:00.000Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0)
  window.localStorage.clear()
  vi.mocked(getFields).mockReset().mockResolvedValue(snapshot.fields)
  vi.mocked(getStations).mockReset().mockResolvedValue(snapshot.stations)
  vi.mocked(getReadings).mockReset().mockResolvedValue(snapshot.readings)
  client = createFieldQueryClient()
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  configure({ asyncWrapper: originalAsyncWrapper })
  window.localStorage.clear()
})

describe('Frost Monitor overview', () => {
  it('keeps the shell and accessible table while loading, without stealing focus on completion', async () => {
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'Frost Monitor' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Field overview' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Station detail' })).toBeVisible()
    expect(screen.getByText(/Measurement date:/)).toHaveTextContent('Jan 15, 2027')
    expect(screen.getByText(/Last 7 days:/)).toHaveTextContent('Jan 9, 2027 – Jan 15, 2027')
    expect(screen.getByRole('status')).toHaveTextContent('Loading field data…')
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(1)

    const refresh = screen.getByRole('button', { name: 'Refresh' })
    expect(refresh).toHaveAttribute('aria-disabled', 'true')
    expect(refresh).not.toBeDisabled()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus()
    expect(screen.getByRole('link')).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    await user.tab()
    expect(refresh).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(getFields).toHaveBeenCalledTimes(1)
    await user.tab()
    const scroller = screen.getByRole('region', { name: 'Field overview table' })
    expect(scroller).toHaveFocus()
    pending.resolve(snapshot.fields)
    await settle()
    expect(scroller).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Field data loaded.')
    expect(refresh).toHaveAttribute('aria-disabled', 'false')
  })

  it('shows risk-first rows, historical minima, explicit no-data labels, and exact dated field trends', async () => {
    renderDashboard()
    await settle()
    const table = screen.getByRole('table', { name: 'Seven-day field observations, frost-risk fields first.' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent))
      .toEqual(['River Flats', 'Apple Orchard', 'No stations'])
    expect(within(rows[0]).getByRole('cell', { name: '-3°C' })).toBeVisible()
    expect(within(rows[0]).getByText('Frost risk')).toBeVisible()
    expect(within(rows[0]).getByText('Cooling -3°C')).toBeVisible()
    expect(within(rows[0]).getByText('Jan 14, 2027')).toBeVisible()
    expect(within(rows[0]).getByText('Jan 15, 2027')).toBeVisible()
    expect(within(rows[1]).getByRole('cell', { name: '4°C' })).toBeVisible()
    expect(within(rows[1]).getByText('No frost observed')).toBeVisible()
    expect(within(rows[1]).getByText('Steady 0°C')).toBeVisible()
    expect(within(rows[2]).getByText('No readings')).toBeVisible()
    expect(within(rows[2]).getByText('No data')).toBeVisible()
    expect(within(rows[2]).getByText('Insufficient readings')).toBeVisible()
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Field', 'Crop', 'Coldest daily low (°C)', 'Frost status', 'Recent trend'])
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col')
    }
    expect(screen.getByText(/Frost risk: any station/)).toHaveTextContent('≤0°C')
    expect(screen.getByText(/Recent change in coldest daily low/))
      .toHaveTextContent('Reporting stations may differ between days.')
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/Last successfully loaded data/)).toBeVisible()
  })

  it('recovers automatically without a terminal alert and retains Refresh focus', async () => {
    vi.mocked(getReadings).mockRejectedValueOnce(failure)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await user.tab()
    await user.tab()
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Loading field data…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(refresh).toHaveFocus()
    await settle()
    expect(screen.getByRole('cell', { name: 'River Flats' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getFields).toHaveBeenCalledTimes(2)
    expect(getStations).toHaveBeenCalledTimes(2)
    expect(getReadings).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveFocus()
    expect(refresh).toHaveAttribute('aria-disabled', 'false')
  })

  it('exhausts initial retries inside the shell and keeps one focused control through manual recovery', async () => {
    vi.mocked(getReadings).mockRejectedValue(failure)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await user.tab()
    await user.tab()
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    await settle()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Field data is currently unavailable. Please retry.')
    expect(screen.getByRole('heading', { name: 'Frost Monitor' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Field overview' })).toBeVisible()
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getByText('No field data loaded.')).toBeVisible()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Retry' })).toBe(refresh)
    expect(refresh).toHaveFocus()
    expect(getReadings).toHaveBeenCalledTimes(4)

    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    await user.keyboard('{Enter}')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('button', { name: 'Refresh' })).toBe(refresh)
    expect(refresh).toHaveFocus()
    expect(refresh).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading field data…')
    pending.resolve(snapshot.readings)
    await settle()
    expect(screen.getByRole('cell', { name: 'River Flats' })).toBeVisible()
    expect(refresh).toHaveFocus()
    expect(refresh).toHaveAttribute('aria-disabled', 'false')
    expect(getReadings).toHaveBeenCalledTimes(5)
  })

  it('renders an explicit successful empty state within the persistent table and shell', async () => {
    vi.mocked(getFields).mockResolvedValue([])
    renderDashboard()
    await settle()
    expect(screen.getByText('No fields available.')).toBeVisible()
    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'Station detail' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Field data loaded.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getStations).not.toHaveBeenCalled()
    expect(getReadings).not.toHaveBeenCalled()
  })

  it('keeps cached rows and timestamp through failure, then replaces visible and persisted values after Retry', async () => {
    saveSnapshot(snapshot)
    client.clear()
    client = createFieldQueryClient()
    vi.mocked(getReadings).mockRejectedValue(failure)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    const riverRow = screen.getByRole('cell', { name: 'River Flats' }).closest('tr')!
    expect(within(riverRow).getByText('-3°C')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing field data…')
    const timestamp = screen.getByText(/Last successfully loaded data/)
    expect(timestamp).toHaveTextContent('Sat, 16 Jan 2027 10:00:00 GMT')
    await user.tab()
    await user.tab()
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    await user.click(screen.getByRole('button', { name: 'River Flats' }))
    const detail = screen.getByRole('region', { name: 'River Flats' })
    expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
    await user.click(refresh)
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh. Showing last successfully loaded data.')
    expect(within(riverRow).getByText('-3°C')).toBeVisible()
    expect(timestamp).toHaveTextContent('Sat, 16 Jan 2027 10:00:00 GMT')
    expect(readSavedSnapshot()).toEqual(snapshot)
    expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).toHaveFocus()

    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    await user.keyboard('{Enter}')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing field data…')
    expect(within(riverRow).getByText('-3°C')).toBeVisible()
    expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus()
    pending.resolve(changedReadings)
    await settle()
    expect(screen.getByRole('cell', { name: '-6°C' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '10°C' })).toBeVisible()
    expect(screen.queryByRole('cell', { name: '-3°C' })).not.toBeInTheDocument()
    expect(timestamp).not.toHaveTextContent('Sat, 16 Jan 2027 10:00:00 GMT')
    expect(readSavedSnapshot()?.readings).toEqual(changedReadings)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(refresh).toHaveFocus()
    expect(screen.getByRole('region', { name: 'River Flats' })).toBe(detail)
    expect(within(detail).getByText('7-day minimum: -6°C')).toBeVisible()
  })

  it('replaces a previously populated overview with a successful empty refresh', async () => {
    saveSnapshot(snapshot)
    client.clear()
    client = createFieldQueryClient()
    vi.mocked(getFields).mockResolvedValue([])
    renderDashboard()
    expect(screen.getByRole('cell', { name: 'River Flats' })).toBeVisible()
    await settle()
    expect(screen.getByText('No fields available.')).toBeVisible()
    expect(screen.queryByRole('cell', { name: 'River Flats' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readSavedSnapshot()?.fields).toEqual([])
  })

  it('moves between field rows only, ignores horizontal arrows, and leaves one row Tab stop without trapping focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    const scroller = screen.getByRole('region', { name: 'Field overview table' })
    expect(scroller).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowRight}')
    expect(scroller).toHaveFocus()
    await user.tab()
    const river = screen.getByRole('button', { name: 'River Flats' })
    const apple = screen.getByRole('button', { name: 'Apple Orchard' })
    const last = screen.getByRole('button', { name: 'No stations' })
    expect(river).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowLeft}{ArrowRight}')
    expect(river).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(apple).toHaveFocus()
    await user.keyboard('{ArrowLeft}{ArrowRight}')
    expect(apple).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(last).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(apple).toHaveFocus()
    await user.keyboard('{End}')
    expect(last).toHaveFocus()
    await user.keyboard('{Home}')
    expect(river).toHaveFocus()
    await user.keyboard('{Control>}{End}{/Control}')
    expect(last).toHaveFocus()
    await user.keyboard('{Control>}{Home}{/Control}')
    expect(river).toHaveFocus()
    expect(river).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    await user.tab({ shift: true })
    expect(scroller).toHaveFocus()
    await user.tab()
    expect(river).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(apple).toHaveFocus()
    await user.tab({ shift: true })
    expect(scroller).toHaveFocus()
    await user.tab()
    expect(apple).toHaveFocus()
    await user.tab()
    expect(document.body).toHaveFocus()
    await user.tab({ shift: true })
    expect(apple).toHaveFocus()
  })

  it('keeps row navigation out of headers, loading placeholders, and empty-state messages', async () => {
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await user.tab()
    await user.tab()
    await user.tab()
    const scroller = screen.getByRole('region', { name: 'Field overview table' })
    await user.keyboard('{ArrowUp}{ArrowDown}{ArrowLeft}{ArrowRight}{Home}{End}')
    expect(scroller).toHaveFocus()
    pending.resolve([])
    await settle()
    expect(screen.getByText('No fields available.')).toBeVisible()
    expect(scroller).toHaveFocus()
    await user.keyboard('{ArrowDown}{Home}')
    expect(scroller).toHaveFocus()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    await user.tab()
    expect(document.body).toHaveFocus()
    await user.tab({ shift: true })
    expect(scroller).toHaveFocus()
  })

  it('preserves the focused field row when a background refresh updates and reorders rows', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    const river = screen.getByRole('button', { name: 'River Flats' })
    expect(river).toHaveFocus()
    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    act(() => { void client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(river).toHaveFocus()
    pending.resolve([
      { stationId: 'warm-1', date: AS_OF_DATE, lowTempC: -10 },
      { stationId: 'frost-2', date: AS_OF_DATE, lowTempC: -6 },
    ])
    await settle()
    expect(river).toHaveFocus()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByRole('button', { name: 'Apple Orchard' })).toBeVisible()
    expect(screen.getByRole('cell', { name: '-6°C' })).toBeVisible()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: 'Apple Orchard' })).toHaveFocus()
  })

  it('restores a row Tab entry when the previously focused field disappears', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveFocus()
    vi.mocked(getFields).mockResolvedValue(snapshot.fields.filter(({ id }) => id !== 'frost'))
    vi.mocked(getStations).mockResolvedValue(snapshot.stations.filter(({ fieldId }) => fieldId !== 'frost'))
    vi.mocked(getReadings).mockResolvedValue(snapshot.readings.filter(({ stationId }) => stationId === 'warm-1'))
    act(() => { void client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey }) })
    await settle()
    expect(screen.queryByRole('button', { name: 'River Flats' })).not.toBeInTheDocument()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Apple Orchard' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: 'Apple Orchard' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'No stations' })).toHaveFocus()
  })

  it('selects with Enter and Space, preserving trigger focus and exposing coldest/offline station histories', async () => {
    vi.mocked(getStations).mockResolvedValue([
      ...snapshot.stations,
      { id: 'offline', fieldId: 'frost', label: 'Offline basin' },
      { id: 'silent', fieldId: 'frost', label: 'No reports' },
    ])
    vi.mocked(getReadings).mockResolvedValue([
      ...snapshot.readings,
      { stationId: 'offline', date: '2027-01-09', lowTempC: -7 },
      { stationId: 'offline', date: '2027-01-11', lowTempC: -5 },
      { stationId: 'offline', date: '2027-01-14', lowTempC: null },
      { stationId: 'offline', date: AS_OF_DATE, lowTempC: null },
      { stationId: 'silent', date: AS_OF_DATE, lowTempC: null },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    const river = screen.getByRole('button', { name: 'River Flats' })
    expect(river).toHaveFocus()
    expect(river).toHaveAttribute('aria-pressed', 'true')
    expect(river).toHaveAttribute('aria-controls', 'field-detail')
    expect(screen.getByRole('status')).toHaveTextContent('Selected field: River Flats.')
    const detail = screen.getByRole('region', { name: 'River Flats' })
    expect(within(detail).getByRole('heading', { level: 2, name: 'River Flats' })).toBeVisible()
    const fieldTrend = within(detail).getByRole('group', { name: 'Recent change in coldest daily low' })
    expect(within(fieldTrend).getByText('Cooling -3°C')).toBeVisible()
    expect(within(fieldTrend).getByText('Jan 14, 2027')).toBeVisible()
    expect(within(fieldTrend).getByText('Jan 15, 2027')).toBeVisible()
    expect(fieldTrend).toHaveTextContent('Reporting stations may differ between days.')
    expect(within(detail).getByRole('note')).toHaveTextContent(
      'Some daily readings are missing. Frost risk and trends use available readings only.',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const cards = within(within(detail).getByRole('list', { name: 'Stations, coldest first' }))
      .getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent))
      .toEqual(['Offline basin', 'South', 'North', 'No reports'])
    expect(within(cards[0]).getByText('Offline')).toBeVisible()
    expect(within(cards[0]).getByText('7-day minimum: -7°C')).toBeVisible()
    expect(within(cards[0]).getByText('Warming +2°C')).toBeVisible()
    expect(within(cards[0]).getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Jan 9, 2027', 'Jan 10, 2027', 'Jan 11, 2027', 'Jan 12, 2027',
      'Jan 13, 2027', 'Jan 14, 2027', 'Jan 15, 2027',
    ])
    expect(within(cards[0]).getAllByRole('definition').map((value) => value.textContent))
      .toEqual(['-7°C', 'No reading', '-5°C', 'No reading', 'No reading', 'No reading', 'No reading'])
    expect(within(cards[1]).getByText('Reporting')).toBeVisible()
    expect(within(cards[2]).getByText('Warming +2°C')).toBeVisible()
    expect(within(cards[3]).getByText('Offline')).toBeVisible()
    expect(within(cards[3]).getByText('7-day minimum: No readings')).toBeVisible()
    expect(within(cards[3]).getByText('Insufficient readings')).toBeVisible()
    expect(within(detail).getByText(/Offline means/)).toHaveTextContent('Jan 15, 2027 or Jan 14, 2027')

    await user.keyboard('{ArrowDown} ')
    const apple = screen.getByRole('button', { name: 'Apple Orchard' })
    expect(apple).toHaveFocus()
    expect(apple).toHaveAttribute('aria-pressed', 'true')
    expect(river).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('region', { name: 'Apple Orchard' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Selected field: Apple Orchard.')
    expect(getFields).toHaveBeenCalledTimes(1)
    expect(getStations).toHaveBeenCalledTimes(1)
    expect(getReadings).toHaveBeenCalledTimes(1)
  })

  it('distinguishes a selected field with no stations from unavailable data', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'No stations' }))
    const detail = screen.getByRole('region', { name: 'No stations' })
    expect(within(detail).getByText('No stations available for this field.')).toBeVisible()
    expect(within(detail).getByText('Insufficient readings')).toBeVisible()
    expect(within(detail).queryByRole('list')).not.toBeInTheDocument()
    expect(within(detail).queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No stations' })).toHaveFocus()
  })

  it('keeps an all-missing station visible with seven missing values, Offline, and insufficient trends', async () => {
    vi.mocked(getFields).mockResolvedValue([
      ...snapshot.fields.slice(0, 2), { id: 'unknown', name: 'All missing', crop: 'Grapes' },
    ])
    vi.mocked(getStations).mockResolvedValue([
      ...snapshot.stations, { id: 'missing', fieldId: 'unknown', label: 'Silent station' },
    ])
    vi.mocked(getReadings).mockResolvedValue([
      ...snapshot.readings, { stationId: 'missing', date: AS_OF_DATE, lowTempC: null },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'All missing' }))
    const detail = screen.getByRole('region', { name: 'All missing' })
    const card = within(detail).getByRole('listitem')
    expect(within(card).getByRole('heading', { name: 'Silent station', level: 3 })).toBeVisible()
    expect(within(card).getByText('Offline')).toBeVisible()
    expect(within(card).getByText('7-day minimum: No readings')).toBeVisible()
    expect(within(card).getByText('Insufficient readings')).toBeVisible()
    expect(within(card).getAllByRole('definition').map((value) => value.textContent))
      .toEqual(Array(7).fill('No reading'))
    expect(within(detail).getByRole('note')).toBeVisible()
    const row = screen.getByRole('button', { name: 'All missing' }).closest('tr')!
    expect(within(row).getByText('No data')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps field selection interactive during refresh and leaves focus on the chosen trigger after completion', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'River Flats' }))
    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    act(() => { void client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing field data…')
    expect(screen.getByRole('region', { name: 'River Flats' })).toBeVisible()
    await user.keyboard('{ArrowDown} ')
    const apple = screen.getByRole('button', { name: 'Apple Orchard' })
    expect(apple).toHaveFocus()
    const detail = screen.getByRole('region', { name: 'Apple Orchard' })
    expect(within(detail).getByText('7-day minimum: 4°C')).toBeVisible()
    pending.resolve(changedReadings)
    await settle()
    expect(apple).toHaveFocus()
    expect(apple).toHaveAttribute('aria-pressed', 'true')
    expect(within(detail).getByText('7-day minimum: 10°C')).toBeVisible()
    expect(getFields).toHaveBeenCalledTimes(2)
    expect(getStations).toHaveBeenCalledTimes(2)
    expect(getReadings).toHaveBeenCalledTimes(2)
  })

  it('rehydrates saved rows on reload and permits immediate selection while the new refresh fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const first = renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'River Flats' }))
    const persisted = readSavedSnapshot()
    first.unmount()
    client.clear()
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    vi.mocked(getReadings).mockRejectedValue(failure)
    client = createFieldQueryClient()
    renderDashboard()
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing field data…')
    await user.click(screen.getByRole('button', { name: 'River Flats' }))
    const detail = screen.getByRole('region', { name: 'River Flats' })
    expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
    expect(getFields).toHaveBeenCalledTimes(2)
    pending.resolve(snapshot.fields)
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh.')
    expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveFocus()
    expect(readSavedSnapshot()).toEqual(persisted)
    expect(getFields).toHaveBeenCalledTimes(5)
  })

  it('resolves a removed selected field to the prompt without retaining stale detail or moving Retry/Refresh focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'River Flats' }))
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const refresh = screen.getByRole('button', { name: 'Refresh' })
    await user.click(refresh)
    expect(screen.getByRole('region', { name: 'River Flats' })).toBeVisible()
    pending.resolve([])
    await settle()
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Station detail', level: 2 })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'River Flats' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('Selected field: River Flats.')
    expect(refresh).toHaveFocus()
    expect(readSavedSnapshot()?.fields).toEqual([])
  })

  it.each(['malformed', 'wrong version', 'wrong date', 'access blocked', 'read blocked', 'write blocked'] as const)(
    'loads selectable detail and retains it on refresh failure with storage %s',
    async (storageCase) => {
      const key = 'frost-indicator:field-snapshot:v1:2027-01-15'
      if (storageCase === 'malformed') window.localStorage.setItem(key, '{')
      if (storageCase === 'wrong version') {
        window.localStorage.setItem(key, JSON.stringify({ ...snapshot, version: 2 }))
      }
      if (storageCase === 'wrong date') {
        window.localStorage.setItem(key, JSON.stringify({ ...snapshot, asOfDate: '2027-01-14' }))
      }
      const unavailable = () => { throw new DOMException('Storage unavailable', 'SecurityError') }
      if (storageCase === 'access blocked') vi.spyOn(window, 'localStorage', 'get').mockImplementation(unavailable)
      if (storageCase === 'read blocked') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable)
      if (storageCase === 'write blocked') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable)
      client.clear()
      client = createFieldQueryClient()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderDashboard()
      expect(screen.getByRole('status')).toHaveTextContent('Loading field data…')
      await settle()
      await user.click(screen.getByRole('button', { name: 'River Flats' }))
      const detail = screen.getByRole('region', { name: 'River Flats' })
      expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
      expect(getFields).toHaveBeenCalledTimes(1)
      vi.mocked(getReadings).mockRejectedValue(failure)
      await user.click(screen.getByRole('button', { name: 'Refresh' }))
      await settle()
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh.')
      expect(within(detail).getByRole('note')).toBeVisible()
      expect(within(detail).getByText('7-day minimum: -3°C')).toBeVisible()
      expect(screen.getByRole('button', { name: 'River Flats' })).toHaveAttribute('aria-pressed', 'true')
    },
  )

  it('does not warn about missing readings in other fields when the selected station has a complete history', async () => {
    vi.mocked(getReadings).mockResolvedValue([
      '2027-01-09', '2027-01-10', '2027-01-11', '2027-01-12',
      '2027-01-13', '2027-01-14', '2027-01-15',
    ].map((date) => ({ stationId: 'warm-1', date, lowTempC: 2 })))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('button', { name: 'Apple Orchard' }))
    const detail = screen.getByRole('region', { name: 'Apple Orchard' })
    expect(within(detail).queryByRole('note')).not.toBeInTheDocument()
    expect(within(detail).getByText('Reporting')).toBeVisible()
    expect(within(detail).getAllByRole('definition').map((value) => value.textContent))
      .toEqual(Array(7).fill('2°C'))
  })

  it('selects from every part of a data row and keeps keyboard selection on the native field button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    const riverRow = screen.getByRole('button', { name: 'River Flats' }).closest('tr')!
    const appleRow = screen.getByRole('button', { name: 'Apple Orchard' }).closest('tr')!
    const clicks = [
      { target: within(riverRow).getByText('Pears'), field: 'River Flats' },
      { target: within(appleRow).getByText('4°C'), field: 'Apple Orchard' },
      { target: within(riverRow).getByText('Frost risk'), field: 'River Flats' },
      { target: within(appleRow).getByText('Steady 0°C'), field: 'Apple Orchard' },
      { target: riverRow, field: 'River Flats' },
    ]
    for (const { target, field } of clicks) {
      await user.click(target)
      expect(screen.getByRole('region', { name: field })).toBeVisible()
      expect(screen.getByRole('button', { name: field })).toHaveFocus()
      expect(screen.getByRole('button', { name: field })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('status')).toHaveTextContent(`Selected field: ${field}.`)
    }
    await user.keyboard('{ArrowDown} ')
    expect(screen.getByRole('region', { name: 'Apple Orchard' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apple Orchard' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveAttribute('aria-pressed', 'false')
    expect(getFields).toHaveBeenCalledTimes(1)
    expect(getStations).toHaveBeenCalledTimes(1)
    expect(getReadings).toHaveBeenCalledTimes(1)
  })

  it('does not select a field when column headers or the caption are clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.click(screen.getByRole('columnheader', { name: 'Crop' }))
    await user.click(screen.getByText('Seven-day field observations, frost-risk fields first.'))
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'River Flats' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Apple Orchard' })).toHaveAttribute('aria-pressed', 'false')
  })
})
