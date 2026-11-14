import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { act, configure, getConfig, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AS_OF_DATE, getFields, getReadings, getStations } from '@/api/mockApi'
import { createFieldQueryClient } from '@/data/queryClient'
import { snapshot } from '@/test/snapshot'
import App from './App'

vi.mock(import('@/api/mockApi'), async (importOriginal) => ({
  ...await importOriginal(), getFields: vi.fn(), getStations: vi.fn(), getReadings: vi.fn(),
}))

const storageKey = `frost-indicator:field-snapshot:v1:${AS_OF_DATE}`
const failure = new Error('Network request failed')
const originalAsyncWrapper = getConfig().asyncWrapper
let client: QueryClient
let user: UserEvent

function renderDashboard() {
  client = createFieldQueryClient()
  render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>)
}

async function settle() {
  await act(async () => { await vi.runAllTimersAsync() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0)
  configure({
    asyncWrapper: async <T,>(callback: () => Promise<T>) => {
      let result!: T
      await act(async () => { result = await callback() })
      return result
    },
  })
  window.localStorage.clear()
  vi.mocked(getFields).mockReset().mockResolvedValue(snapshot.fields)
  vi.mocked(getStations).mockReset().mockImplementation(async (ids) => (
    snapshot.stations.filter((station) => ids === undefined || ids.includes(station.fieldId))
  ))
  vi.mocked(getReadings).mockReset().mockImplementation(async (ids, from, to) => (
    snapshot.readings.filter((reading) => (
      ids.includes(reading.stationId) && reading.date >= from && reading.date <= to
    ))
  ))
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
})

afterEach(() => {
  client.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  configure({ asyncWrapper: originalAsyncWrapper })
  window.localStorage.clear()
})

it('selects fields by row click and keyboard', async () => {
  renderDashboard()
  await settle()
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  expect(rows.map((row) => within(row).getByRole('button').textContent)).toEqual(['River', 'Orchard'])
  expect(within(rows[0]).getByRole('cell', { name: '-2°C' })).toBeVisible()
  expect(within(rows[1]).getByRole('cell', { name: '4°C' })).toBeVisible()
  await user.click(within(rows[0]).getByText('Frost risk'))
  const river = screen.getByRole('button', { name: 'River' })
  const orchard = screen.getByRole('button', { name: 'Orchard' })
  expect(river).toHaveFocus()
  expect(river).toHaveAttribute('aria-pressed', 'true')
  const detail = within(screen.getByRole('region', { name: 'River' }))
  expect(detail.getByRole('heading', { name: 'Basin' })).toBeVisible()
  expect(detail.getByText('Offline')).toBeVisible()
  expect(detail.getByRole('note')).toBeVisible()
  expect(detail.getAllByRole('definition').map((value) => value.textContent)).toEqual([
    '0°C', 'No reading', 'No reading', 'No reading', '-2°C', 'No reading', 'No reading',
  ])
  await user.keyboard('{ArrowDown}')
  expect(orchard).toHaveFocus()
  await user.keyboard('{ArrowLeft}')
  expect(orchard).toHaveFocus()
  await user.keyboard('{ArrowRight}')
  expect(orchard).toHaveFocus()
  expect(orchard).toHaveAttribute('aria-pressed', 'false')
  await user.keyboard('{Enter}')
  expect(orchard).toHaveAttribute('aria-pressed', 'true')
  await user.keyboard('{ArrowUp}')
  expect(river).toHaveFocus()
  await user.keyboard(' ')
  expect(river).toHaveAttribute('aria-pressed', 'true')
  expect(orchard).toHaveAttribute('aria-pressed', 'false')
  await user.tab({ shift: true })
  expect(screen.getByRole('region', { name: 'Field overview table' })).toHaveFocus()
  await user.tab()
  expect(river).toHaveFocus()
  await user.tab()
  expect(document.body).toHaveFocus()
})

it('keeps cached detail until Retry succeeds', async () => {
  window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
  vi.mocked(getReadings).mockRejectedValue(failure)
  renderDashboard()
  expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'true')
  await user.click(screen.getByRole('button', { name: 'River' }))
  const detail = within(screen.getByRole('region', { name: 'River' }))
  expect(detail.getByText('7-day minimum: -2°C')).toBeVisible()
  await settle()
  expect(getReadings).toHaveBeenCalledTimes(4)
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.getByRole('cell', { name: '-2°C' })).toBeVisible()
  expect(detail.getByText('7-day minimum: -2°C')).toBeVisible()
  expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(snapshot)
  const readings = [...snapshot.readings, { stationId: 'cold', date: AS_OF_DATE, lowTempC: -6 }]
  vi.mocked(getReadings).mockResolvedValue(readings)
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await settle()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '-6°C' })).toBeVisible()
  expect(detail.getByText('7-day minimum: -6°C')).toBeVisible()
  expect(JSON.parse(window.localStorage.getItem(storageKey)!).readings).toEqual(readings)
})

it('recovers from first-load failure without storage', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage unavailable', 'SecurityError')
  })
  vi.mocked(getFields).mockRejectedValue(failure)
  renderDashboard()
  expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'true')
  await settle()
  expect(screen.getByRole('heading', { name: 'Frost Monitor' })).toBeVisible()
  expect(screen.getByRole('table')).toBeVisible()
  expect(screen.getByRole('alert')).toBeVisible()
  vi.mocked(getFields).mockResolvedValue(snapshot.fields)
  const retry = screen.getByRole('button', { name: 'Retry' })
  await user.click(retry)
  await settle()
  expect(retry).toHaveFocus()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'River' })).toBeVisible()
})
