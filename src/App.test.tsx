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
    expect(screen.queryByRole('button', { name: 'River Flats' })).not.toBeInTheDocument()
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
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh. Showing last successfully loaded data.')
    expect(within(riverRow).getByText('-3°C')).toBeVisible()
    expect(timestamp).toHaveTextContent('Sat, 16 Jan 2027 10:00:00 GMT')
    expect(readSavedSnapshot()).toEqual(snapshot)
    expect(refresh).toHaveFocus()

    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    await user.keyboard('{Enter}')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing field data…')
    expect(within(riverRow).getByText('-3°C')).toBeVisible()
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
    expect(screen.getByText('Select a field to view its stations.')).toBeVisible()
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

  it('supports bounded keyboard cell navigation and one cell Tab stop without trapping focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    const scroller = screen.getByRole('region', { name: 'Field overview table' })
    expect(scroller).toHaveFocus()
    await user.tab()
    const fieldHeader = screen.getByRole('columnheader', { name: 'Field' })
    expect(fieldHeader).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowLeft}')
    expect(fieldHeader).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('cell', { name: 'River Flats' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('cell', { name: 'Pears' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('cell', { name: 'Apples' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('cell', { name: 'Apple Orchard' })).toHaveFocus()
    await user.keyboard('{End}')
    const warmTrend = screen.getByRole('cell', { name: /Steady 0°C/ })
    expect(warmTrend).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(warmTrend).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('cell', { name: 'Apple Orchard' })).toHaveFocus()
    await user.keyboard('{Control>}{End}{/Control}')
    const lastCell = screen.getByRole('cell', { name: 'Insufficient readings' })
    expect(lastCell).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowRight}')
    expect(lastCell).toHaveFocus()
    await user.keyboard('{Control>}{Home}{/Control}')
    expect(fieldHeader).toHaveFocus()
    await user.tab({ shift: true })
    expect(scroller).toHaveFocus()
    await user.tab()
    expect(fieldHeader).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowRight}')
    const pears = screen.getByRole('cell', { name: 'Pears' })
    expect(pears).toHaveFocus()
    await user.tab({ shift: true })
    expect(scroller).toHaveFocus()
    await user.tab()
    expect(pears).toHaveFocus()
    await user.tab()
    expect(document.body).toHaveFocus()
    await user.tab({ shift: true })
    expect(pears).toHaveFocus()
  })

  it('keeps keyboard navigation out of decorative loading rows and empty-state messages', async () => {
    const pending = deferred<Field[]>()
    vi.mocked(getFields).mockReturnValueOnce(pending.promise)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{Control>}{End}{/Control}{ArrowDown}')
    const trendHeader = screen.getByRole('columnheader', { name: 'Recent trend' })
    expect(trendHeader).toHaveFocus()
    pending.resolve([])
    await settle()
    expect(screen.getByText('No fields available.')).toBeVisible()
    expect(trendHeader).toHaveFocus()
    await user.keyboard('{ArrowDown}{Home}')
    expect(screen.getByRole('columnheader', { name: 'Field' })).toHaveFocus()
  })

  it('preserves the focused field cell when a background refresh updates and reorders rows', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}')
    const riverMinimum = screen.getByRole('cell', { name: '-3°C' })
    expect(riverMinimum).toHaveFocus()
    const pending = deferred<Reading[]>()
    vi.mocked(getReadings).mockReturnValueOnce(pending.promise)
    act(() => { void client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(riverMinimum).toHaveFocus()
    pending.resolve([
      { stationId: 'warm-1', date: AS_OF_DATE, lowTempC: -10 },
      { stationId: 'frost-2', date: AS_OF_DATE, lowTempC: -6 },
    ])
    await settle()
    expect(screen.getByRole('cell', { name: '-6°C' })).toHaveFocus()
    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByRole('cell', { name: 'Apple Orchard' })).toBeVisible()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('cell', { name: '-10°C' })).toHaveFocus()
  })

  it('restores a cell Tab entry when the previously focused field disappears', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderDashboard()
    await settle()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('cell', { name: '-3°C' })).toHaveFocus()
    vi.mocked(getFields).mockResolvedValue([])
    act(() => { void client.invalidateQueries({ queryKey: fieldSnapshotQueryOptions.queryKey }) })
    await settle()
    expect(screen.getByText('No fields available.')).toBeVisible()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('columnheader', { name: 'Coldest daily low (°C)' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('columnheader', { name: 'Coldest daily low (°C)' })).toHaveFocus()
  })
})
