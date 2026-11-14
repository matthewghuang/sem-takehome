import { addDays, AS_OF_DATE } from '@/api/mockApi'
import { FieldOverview } from '@/components/FieldOverview'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useFieldData } from '@/hooks/useFieldData'
import { formatDate } from '@/lib/formatDate'

const fromDate = addDays(AS_OF_DATE, -6)

function App() {
  const { fields, fetchedAt, isRefreshing, error, refresh } = useFieldData()
  const status = isRefreshing
    ? fields === null ? 'Loading field data…' : 'Refreshing field data…'
    : error !== null || fields === null ? '' : 'Field data loaded.'

  return (
    <>
      <a
        href="#main-content"
        className="absolute top-4 left-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Skip to main content
      </a>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Frost Monitor</h1>
            <p className="text-sm">
              Measurement date: <time dateTime={AS_OF_DATE}>{formatDate(AS_OF_DATE)}</time>
              {' · Fixed reference date, not live weather'}
            </p>
            <p className="text-sm text-muted-foreground">
              Last 7 days: <time dateTime={fromDate}>{formatDate(fromDate)}</time>
              {' – '}<time dateTime={AS_OF_DATE}>{formatDate(AS_OF_DATE)}</time>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            aria-disabled={isRefreshing}
            onClick={() => { if (!isRefreshing) refresh() }}
            className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {error !== null ? 'Retry' : 'Refresh'}
          </Button>
        </header>

        <div className="space-y-3">
          <p role="status" aria-live="polite" aria-atomic="true" className="min-h-6 text-sm">
            {status}
          </p>
          {fetchedAt !== null && (
            <p className="text-sm break-words text-muted-foreground">
              Last successfully loaded data. Last successful fetch:{' '}
              <time dateTime={fetchedAt}>{new Date(fetchedAt).toUTCString()}</time>
            </p>
          )}
          {error !== null && (
            <Alert>
              <AlertDescription className="text-foreground">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <section aria-labelledby="field-overview-heading" className="min-w-0 space-y-4">
          <h2 id="field-overview-heading" className="text-xl font-semibold">Field overview</h2>
          <div id="overview-explanation" className="space-y-2 text-sm text-muted-foreground">
            <p>
              Frost risk: any station daily low ≤0°C within this seven-day window.
              Risk uses available readings only; it is not a forecast.
              No frost observed does not guarantee no risk.
            </p>
            <p>
              Recent change in coldest daily low compares the latest two available daily minima.
              Reporting stations may differ between days.
            </p>
          </div>
          <FieldOverview fields={fields} isLoading={isRefreshing} />
        </section>

        <section id="field-detail" aria-labelledby="field-detail-heading" className="space-y-3 rounded-xl border p-5">
          <h2 id="field-detail-heading" className="text-xl font-semibold">Station detail</h2>
          <p className="text-sm text-muted-foreground">Select a field to view its stations.</p>
        </section>
      </main>
    </>
  )
}

export default App
