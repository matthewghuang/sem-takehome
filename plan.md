# Dashboard implementation context

Build on the existing Vite/React/TypeScript project. Replace the starter screen with a field overview and an inline selected-field detail section. Use shadcn/ui components with Tailwind CSS and semantic HTML, plus textual trend arrows; no routing or charting dependency is needed. Accessibility is an acceptance criterion, not something guaranteed merely by choosing a component library.

Use `@tanstack/react-query` for server-state caching, request deduplication, refresh status, and bounded retries, and `@tanstack/react-table` for the headless overview row/column model. Keep shadcn/semantic HTML as the presentation layer. Render all field rows and selected-field station cards normally. These libraries do not provide backend pagination, reduce the full snapshot payload, or eliminate the cost of computing summaries.

Title the screen `Frost Monitor`. Its primary acceptance goal is that a grower can quickly identify at-risk fields, see whether a chosen field is getting colder or warmer, and find the coldest and offline stations. All analysis uses the seven days ending on AS_OF_DATE, inclusive—not the computer clock. Show the reference date prominently so “right now” cannot be mistaken for live wall-clock weather.

The existing `src/api/mockApi.ts` exports `Field`, `Station`, `Reading`, `AS_OF_DATE = "2027-01-15"`, `FAILURE_RATE = 0.05`, `addDays(isoDate: string, days: number): string`, `getFields()`, `getStations(fieldIds?: string[])`, and `getReadings(stationIds: string[], from: string, to: string)`. Reading endpoints include both date boundaries. Responses are cloned, delayed 300–1500 ms, and can reject with `Network request failed`. Null temperatures represent missing reports, not zero. Leave this file unchanged, including FAILURE_RATE at its supplied value for delivery. Any proposed backend changes belong in README, not in the API implementation.

This document specifies implementation only. The current approval authorizes writing this plan file, not implementing the dashboard or installing dependencies.

## Implementation increments and manual review gates

The sections under Approach remain the detailed specification. Execute the increments below instead of treating each Approach section as one large implementation. Each increment is a separate reviewable change; stop after its verification and wait for manual approval before starting the next. This breakdown does not authorize implementation.

Keep the application runnable at every gate. Include behavior tests with the increment that introduces the behavior; Approach step 4 is the coverage checklist, not a deferred testing phase. Do not add temporary application screens, incomplete exported contracts, or fake production data to bridge increments. Use isolated tests or throwaway verification scripts for code not yet connected to the screen.

### Increment 1 — UI foundation

- **Scope:** Approach step 0 only: Tailwind/Vite setup, TypeScript aliases, shadcn initialization, generated primitives, utility, theme, and dependency changes, including TanStack Query and Table. Keep the starter application and StrictMode bootstrap working; do not build dashboard components yet.
- **Verification:** Run the build once and open the starter in the development browser. Confirm it still renders with the generated global styles.
- **Manual review gate:** Review configuration, generated component sources, dependency/lockfile changes, and theme. No API changes.

### Increment 2 — Domain analysis with unit coverage

- **Depends on:** Increment 1.
- **Scope:** Introduce the Vitest/Testing Library setup from Approach step 4, then implement the complete `fieldSummary.ts` contract from step 1 and its domain tests. Include date boundaries, inclusive zero threshold, null exclusion, field joins, offline semantics, both trend levels, and deterministic field/station ordering. Include the field-cooling/station-warming and tied/all-null station fixtures. Document the analysis and missing-data limitations in README.
- **Verification:** Run `npm run test:run -- src/domain/fieldSummary.test.ts` and the build once.
- **Manual review gate:** Review small fixtures against actual calculated summaries. Confirm no mutation, interpolation, clock-dependent analysis, or UI/data-loading changes.

### Increment 3 — Complete snapshot loading with bounded retries

- **Depends on:** Increment 2.
- **Scope:** Add the complete raw-snapshot loader and TanStack Query options in `src/data/fieldData.ts`. Fetch fields, stations, then readings; batch ids and skip unnecessary endpoints. Return a snapshot only after the whole pipeline succeeds. Query owns bounded retries; do not add an endpoint retry helper, persistence, or dashboard UI yet.
- **Coverage:** Test transient recovery, four-attempt exhaustion, exact backoff bounds with controlled randomness, full-pipeline restart after a rejected endpoint, empty fields, and fields without stations. Use module-boundary API mocks and a fresh QueryClient; retain the real API implementation unchanged.
- **Verification:** Run the targeted loader/query tests with fake timers and the build once.
- **Manual review gate:** Review endpoint sequencing, query retry termination, failure propagation, and complete-snapshot boundaries. No partially published data; earlier endpoints repeat on a query retry by design.

### Increment 4 — Validated snapshot persistence

- **Depends on:** Increment 3.
- **Scope:** Add snapshot validation and optional localStorage read/write helpers alongside the loader. Use the exact cache key, schema, reference checks, and fixed-date rules in Approach step 2. Storage failures must never reject the query or trigger retries. Do not connect persistence to React yet.
- **Coverage:** Valid round-trip; malformed JSON; wrong version/date; invalid timestamps/calendar dates; nonfinite temperatures; missing required strings; duplicate entity ids; broken references; and storage reads/writes throwing. Prove successful empty snapshots can replace populated ones.
- **Verification:** Run the targeted persistence tests and the build once.
- **Manual review gate:** Inspect accepted/rejected fixtures and saved raw data. Confirm optional storage cannot break successful in-memory loading and no derived summaries or errors are persisted.

### Increment 5 — Query client integration and React hook

- **Depends on:** Increment 4.
- **Scope:** Integrate one application QueryClient, QueryClientProvider, and the `useFieldData` adapter from Approach step 2. Hydrate the complete snapshot synchronously once before rendering subscribers, derive summaries, refresh on mount, and let Query deduplicate work. Retain successful data across refreshes and failures; allow manual retry after settlement. Keep the starter screen unchanged.
- **Coverage:** Use hook consumers to prove first-render hydration, refresh transitions, failed-refresh retention, successful replacement including an empty result, concurrent consumers/StrictMode deduplication, unmount safety, and storage-unavailable fallback. Give each test a fresh QueryClient and clean up subscriptions/timers.
- **Verification:** Run the targeted query/hook tests and the build once.
- **Manual review gate:** Review query keys/options, provider lifecycle, initialization frequency, and persisted/query data after success, failure, and retry. No parallel custom store, polling, or duplicate pipeline.

### Increment 6 — Live field overview and resilient shell

- **Depends on:** Increment 5.
- **Scope:** Replace the starter screen with the persistent `Frost Monitor` shell and `FieldOverview`, connected to the real hook. Use TanStack Table for typed columns and stable field-id rows, retaining domain risk-first order. Include the reference date/window, risk rule, table/caption/headers, visible risk labels, minima, and dated field trends. Implement first-load skeletons, empty state, saved-data timestamp, non-blocking refresh/failure messages, and the persistent guarded Refresh/Retry button. Keep the detail region mounted with its selection prompt; add field-selection controls with the complete detail interaction in Increment 7 rather than shipping inactive buttons here.
- **Accessibility:** Add the skip link, main landmark, heading hierarchy, polite request status, single exhaustion alert, and focusable named table overflow region now—not as later remediation.
- **Coverage:** Add App integration tests for pending initial load, risk-first rows/minima/trends, automatic recovery, terminal first-load failure and Retry, empty fields, and cached overview retention/replacement. Assert persistent shell and Refresh/Retry focus through request transitions.
- **Verification:** Run the targeted App tests and the build once. Open the real dashboard in the browser and confirm overview values and retry behavior without altering the API.
- **Manual review gate:** Review the live overview and every shell state. At this gate field names are plain text and the detail region is an explicit selection prompt; station selection is the next increment, not represented by nonfunctional controls.

### Increment 7 — Field selection and station detail

- **Depends on:** Increment 6.
- **Scope:** Add `FieldDetail` and replace plain field names with native shadcn selection buttons using the specified props, `aria-pressed`, and `aria-controls`. Implement selected-id resolution, polite selection announcements, and trigger-focus retention. Show field trend/caveat, missing-data warning, coldest-first station cards, seven dated lows, minima, Reporting/Offline labels, station trends, and distinct no-stations/all-missing states.
- **Coverage:** Extend App tests for Enter/Space selection, exact comparison dates, missing readings, coldest/offline discoverability, station order, no-station and all-null fields, selection surviving failed refresh, changed data after Retry, selection disappearing from a new snapshot, and no focus stealing. Prove refresh/reload persistence end to end, including invalid/unavailable storage paths.
- **Verification:** Run the targeted App tests and the build once. In the real browser, select River Flats and verify the specified S-03 offline/missing-day details and the grower's three primary questions.
- **Manual review gate:** Review the full overview-to-detail flow using keyboard only. Confirm selection needs no additional API calls and cached detail stays interactive during refresh and after failure.

### Increment 8 — Final accessibility and acceptance review

- **Depends on:** Increment 7.
- **Scope:** Execute the full Verification section and close observed defects only. Complete README coverage of cache scope, first-visit failure limits, retry policy, fixed reference date, missing-data semantics, and any proposed backend improvements. Do not change the API or expand product scope.
- **Verification:** Run `npm run test:run` and `npm run build` once for the final change. Verify real-API reload hydration, skip link, Tab/Shift+Tab, Enter/Space, retained focus, VoiceOver announcements/headings/table structure, 320 CSS-pixel layout, 200% zoom, actual text/status/focus contrast, control sizes, and keyboard access to table overflow. Record observed results and any unavailable verification honestly.
- **Manual review gate:** Review the final browser surface, test results, documentation, and acceptance evidence. Every original requirement remains required; this gate does not substitute a build for behavioral or visual proof.

## Approach

### 0. Set up accessible shared UI primitives

Follow the official [shadcn/ui existing Vite project setup](https://ui.shadcn.com/docs/installation/vite), without regenerating the application. Install `tailwindcss` and `@tailwindcss/vite`; add the Tailwind plugin alongside the existing React plugin in `vite.config.ts`. Set the Vite `@` alias to the absolute `src` directory using `fileURLToPath(new URL('./src', import.meta.url))` from `node:url`. Add `"paths": { "@/*": ["./src/*"] }` to compilerOptions in `tsconfig.json` and `tsconfig.app.json`, retaining existing settings; read the root tsconfig before editing (its contents are unverified). Use relative paths mappings without `baseUrl` to suit this project's TypeScript 7.

Install `@tanstack/react-query` and `@tanstack/react-table` as runtime dependencies. Use their React APIs directly; do not add a second data-fetching cache or table framework.

Initialize the existing project with `npx shadcn@latest init`, choosing the Radix base, neutral colors, CSS variables, TypeScript, and the default style offered for that base. Use `src/index.css` as the global stylesheet and `@/components/ui` and `@/lib/utils` for generated components and utilities. Then run `npx shadcn@latest add button table badge card alert skeleton`. Retain the generated dependencies and component source; do not hand-roll equivalent primitives. Initialization creates `components.json` and the shared class-name utility; reuse that utility rather than adding a second convention. Keep the generated theme and Tailwind imports in the global stylesheet.

Use shadcn Button for field selection and Retry (rendered as native buttons with `type="button"`), Table and its semantic subcomponents for overview, Badge with visible text for frost/offline status, Card for station grouping, Alert for failures, and decorative Skeletons alongside an announced loading message. Do not use a data-grid widget or introduce dialogs for the main flow. Generated visual wrappers do not replace headings, labels, captions, or live-region semantics; supply these at application call sites.

### 1. Establish date, risk, offline, and trend semantics

Add `src/domain/fieldSummary.ts`; there is no dashboard domain implementation in the current starter. Import API types using type-only imports and reuse its UTC-safe `addDays`; never use the machine's current date.

Export `summarizeFields(fields: Field[], stations: Station[], readings: Reading[], asOfDate: string): FieldSummary[]` and the view-model types it returns:

- `DailyLow = { date: string; lowTempC: number | null }`.
- `Trend = { direction: 'warming' | 'cooling' | 'steady' | 'insufficient'; fromDate: string | null; toDate: string | null; deltaC: number | null }`.
- `StationSummary = { station: Station; dailyLows: DailyLow[]; coldestLowC: number | null; offline: boolean; trend: Trend }`.
- `FieldSummary = { field: Field; stations: StationSummary[]; dailyLows: DailyLow[]; coldestLowC: number | null; risk: 'at-risk' | 'no-frost-observed' | 'unknown'; trend: Trend }`.

Generate seven chronological dates from `addDays(asOfDate, -6)` through `asOfDate`, inclusive. Join fields to their stations via fieldId and readings via stationId. Index readings once; exclude dates outside this window and unrelated stations. Fill absent station/date readings with null. Do not mutate input arrays.

For each field, take the minimum non-null low across its stations in that window. A minimum ≤ 0 means `at-risk`; a positive minimum means `no-frost-observed`; no numeric readings, including no stations, means `unknown`. Display those as `Frost risk`, `No frost observed`, and `No data`, respectively: never imply missing data is safe. Show a note that risk uses available readings and is not a forecast.

A station is offline only if neither asOfDate nor the preceding day has a non-null reading. Missing records and explicit nulls both count as no report. A numeric 0 is a valid reading.

For station trend, compare the two latest non-null daily lows within the seven-day window. Set deltaC to newer minus older; positive means warming, negative cooling, zero steady. Store the two dates so the UI can state the exact comparison. Fewer than two numeric readings produces direction `insufficient` with null dates/delta. Missing days are skipped, not interpolated.

For field trend, first compute each date's minimum non-null temperature across that field's stations, or null if none reported. Store this seven-day series in FieldSummary.dailyLows and apply the same two-latest-available-dates comparison used for stations. Label it `Recent change in coldest daily low`, show direction, signed °C change and compared dates, and state that the reporting stations may differ between days. This is an observed change, not a forecast or a whole-week regression. Display `Insufficient readings` when appropriate.

Compute each station's coldestLowC as its minimum actual reading within the seven-day window, or null. Order station items by this value ascending, put null values last, and break ties by station label then id. Label the order `Coldest stations first — last 7 days`; show each station's minimum alongside its reporting status so the grower can find both cold stations and offline ones without inspecting all seven values.

Ignore null/missing values in analysis; do not interpolate, forward-fill, or substitute zero. Preserve their dates in the displayed history as `No reading`. When any station in the selected field has a missing day in the seven-day window, show a visible warning: `Some daily readings are missing. Frost risk and trends use available readings only.` This is informational, not a network error, and remains distinct from the Offline label. In README explain that excluding missing measurements avoids presenting invented temperatures as observations, can miss frost events on unreported days, and makes `No frost observed` different from a guarantee of no risk. Document that all-missing data yields unknown risk and insufficient trend, while offline status checks actual reports on the last two dates.

Sort fields with `at-risk` first, then all others, using field name and then id as deterministic tie-breakers. Do not add a filter: risk-first ordering satisfies discoverability without extra state.

### 2. Persist successful snapshots and retry transient requests

Add `src/data/fieldData.ts` and `src/hooks/useFieldData.ts`; the starter has no cache or data-loading layer. Export `useFieldData()` returning `{ fields: FieldSummary[] | null, fetchedAt: string | null, isRefreshing: boolean, error: string | null, refresh: () => void }`. Null fields means no successful snapshot; an empty array means a successful empty result. Keep data independent of request status so loading and failures cannot erase it.

In `src/data/fieldData.ts`, define `Snapshot = { version: 1; asOfDate: string; fetchedAt: string; fields: Field[]; stations: Station[]; readings: Reading[] }`. Persist the raw complete snapshot, not derived view models, under localStorage key `frost-indicator:field-snapshot:v1:${AS_OF_DATE}`. Recompute summaries on hydration. Synchronously hydrate once on first access so saved rows appear on the first render, then refresh in the background on mount. No expiration for this fixed-date dataset: retain it until a complete successful refresh replaces it. Clearly label saved data and its last successful fetch time; AS_OF_DATE remains the measurement date, distinct from fetchedAt.

Treat storage as untrusted and optional. Validate version/date, a parseable fetchedAt timestamp, arrays, required string fields, and finite numeric-or-null temperatures plus ISO calendar dates before using a snapshot; validate unique entity ids and references from stations to fields and readings to stations. Reject malformed/mismatched snapshots without crashing and fetch normally. Catch localStorage read/write/JSON errors; continue with in-memory data if storage is blocked or full. Persist only successful API data, never errors or placeholders. Do not clear a valid snapshot on network failure. Cache is same-origin/device only, not a guarantee of first-visit availability.

Load `getFields()`, then `getStations(fieldIds)`, then `getReadings(stationIds, addDays(AS_OF_DATE, -6), AS_OF_DATE)`. Skip subsequent endpoints when fields are empty; skip readings when stations are empty while retaining fields with unknown risk. Batch identifiers per endpoint. Only publish/persist after the entire snapshot succeeds; do not mix new fields with old readings. Successful empty results are authoritative and replace an older snapshot. Field selection uses the current snapshot without another API call.

Define one snapshot query keyed by `['field-snapshot', 1, AS_OF_DATE]`. Its query function executes the entire pipeline above. Configure TanStack Query with `retry: 3` (four attempts total) and `retryDelay: (retryIndex) => Math.min(1000 * 2 ** retryIndex, 4000) + Math.floor(Math.random() * 251)`. Retries restart the complete pipeline, including earlier successful endpoints; this intentionally replaces the former endpoint-only retry requirement to avoid a second retry/cache layer. Never publish or persist partial results. Endpoint rejections use this bounded policy; storage errors are caught separately and never cause a retry. Validate persisted input outside the query function, and compute domain summaries outside retryable network work.

Create one application-lifetime QueryClient in `src/data/queryClient.ts`, outside component render, and provide it through QueryClientProvider while retaining StrictMode. Set `staleTime: 0`, `gcTime: Infinity`, `refetchOnMount: true`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchInterval: false`, and `networkMode: 'always'` for this self-contained mock backend. Query owns in-flight deduplication, subscriptions, and retained successful data; do not implement `useSyncExternalStore`, a custom status store, a separate in-flight promise, or `withRetry`. Do not consume an AbortSignal or change the API; unmounting observers must not cancel the shared request.

Before rendering subscribers, synchronously read and validate storage once and seed the snapshot query with `setQueryData`, using fetchedAt as its update time. Mount then refreshes the stale snapshot in the background. Persist only complete successful query results through a single application-lifetime success subscription filtered to the snapshot key; never persist error/status changes. Storage writes are optional and caught. Memoize summaries by successful snapshot identity. The hook maps query data to fields/fetchedAt, `isFetching` to isRefreshing, and a terminal query error to the specified error message even when old data remains. Refresh is guarded while fetching and otherwise uses `refetch({ cancelRefetch: false })`; manual retry reruns the complete pipeline. A successful empty snapshot replaces old data. A failed refresh keeps previous data and fetchedAt unchanged. Do not use placeholder data or treat query error status as proof that data is absent.

While refreshing with data, leave every row and selected detail interactive and display `Refreshing field data…`. On exhaustion with data, retain it with a non-blocking Alert: `Could not refresh. Showing last successfully loaded data.` and Retry. Without data, preserve the dashboard heading, date range, overview headings, and detail region; show skeleton placeholders while requests retry, then `Field data is currently unavailable. Please retry.` inline with Retry after exhaustion. Do not show a full-page failure screen, fabricated values, or endless skeletons once attempts stop. A first visit where every request fails cannot display real data; this limitation must be stated honestly.

### 3. Render the field overview and station details

Replace starter `src/App.tsx` content with the dashboard and compose new `src/components/FieldOverview.tsx` and `src/components/FieldDetail.tsx`. No equivalent components exist in the starter. Use props `FieldOverview({ fields, selectedFieldId, onSelect }: { fields: FieldSummary[]; selectedFieldId: string | null; onSelect: (id: string) => void })` and `FieldDetail({ field }: { field: FieldSummary })`.

App owns only the selected field id in addition to the data hook. Initially select no field and show `Select a field to view its stations.` in the detail region. Selecting a native field-name button sets the id and displays that field below the overview; leave keyboard focus on the button so repeated navigation through fields remains easy. Mark selection using `aria-pressed`, connect buttons to the persistent detail region via `aria-controls`, and announce the selected field name in a polite live status. Resolve the selected id against the current result; if absent, show the selection prompt rather than stale content.

Keep the h1, date range, overview structure, and detail region visible in every state. Use the cache/refresh messages specified in step 2 and one polite status announcement per meaningful transition, not per automatic retry attempt. Provide a persistent shadcn Button labeled `Refresh` normally and `Retry` after exhaustion; use `aria-disabled="true"` during an active refresh and guard its handler so focus is retained without duplicate requests. A successful empty field list renders `No fields available.`; an empty station list renders `No stations available for this field.`. Loading and failure never hide a previously successful overview or selected detail.

Overview: a semantic table with a caption, column headers for Field, Crop, Coldest daily low (°C), Frost status, and Recent trend. Render field names as selection buttons, numeric values with °C, and null minima as `No readings`. Include the explicit ≤0°C rule and seven-day window. Frost status uses visible words, not color alone. In Recent trend show the field's warming/cooling/steady text plus signed change and comparison dates, or `Insufficient readings`; explain that it compares the latest two available daily minima.

Use TanStack Table's core row model with typed column definitions and `getRowId` based on field id. Feed it the already risk-first summaries; do not introduce user sorting, filtering, or pagination. Render its headers/cells through shadcn's semantic Table components. Memoize column definitions and keep row inputs stable between actual data changes. Retain native table semantics and provide keyboard cell navigation: one roving cell Tab stop, bounded arrow-key movement through headers and data cells, Home/End for row edges, and Ctrl+Home/End for table edges. Tab/Shift+Tab must leave normally. Skip decorative loading rows and empty messages; retain focus by field id across refreshes and restore a header entry when a focused field disappears.

Render the complete overview table and every station card for the selected field without windowing, spacer rows, measurement observers, or rendering-mode toggles. Use normal document flow, stable entity-id keys, and wrapping station cards. Preserve all five overview columns and all seven dated values per station.

Detail: a labeled section headed by field name, with one station item per station. Show station label, visible `Offline` or `Reporting` status, and all seven dated daily lows in chronological order. Null values say `No reading`. Use arrows plus `Warming`, `Cooling`, or `Steady` text, with `Insufficient readings` for unavailable trends. Arrows are decorative/aria-hidden; text communicates the result. Explain that Offline means no report on AS_OF_DATE or the previous day. Even entirely missing stations retain their seven daily entries, offline label, and insufficient trend.

At the top of detail, repeat the selected field's recent trend with comparison dates and the changing-reporting-stations caveat. Render the station items in their coldest-first order and show `7-day minimum` for each, retaining Offline labels even if that station has an older cold reading. No-data stations remain visible at the end.

Replace starter rules in `src/App.css` and `src/index.css` with Tailwind utilities and minimal global styles, preserving the generated shadcn theme and imports. Use bounded readable content width, wrapping station cards, readable table cells, and horizontal table overflow on small screens without clipping controls. Use semantic headings and native-button shadcn controls; no clickable rows or color-only signals. Keep field-selection button activation separate from table-cell keyboard navigation. Retain the existing React StrictMode bootstrap in `src/main.tsx`.

Target WCAG 2.2 AA basics: text contrast at least 4.5:1 (3:1 for large text), visible focus indicators with sufficient contrast, and at least 24×24 CSS-pixel control targets. Do not remove the component library's focus ring. Include a keyboard-visible skip link to `<main id="main-content">`; maintain one h1, section h2s, and station h3s even if CardTitle does not render a heading by default. Set table column headers to `scope="col"` and provide a caption. Make any horizontally scrollable table wrapper keyboard-focusable with a descriptive accessible name and visible focus outline. Preserve readability at 200% zoom and a 320 CSS-pixel viewport, allowing horizontal scrolling only inside the table region.

Keep a persistent polite status region for loading/selection messages, hide decorative skeletons and icons from assistive technology, and use only one role=alert for an exhausted refresh (avoid nested Alert/live-region duplication). Keep the Refresh/Retry control mounted and retain focus on it through retries and completion; do not move focus because a background request completes. Field selection also retains focus on its trigger. Use displayed field/station names in accessible names and never require hover to understand risk or offline status.

### 4. Add deterministic behavioral coverage

`package.json` currently has dev/build/lint/preview scripts and no test setup. Add development dependencies `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom`, using versions compatible with the existing Vite 8 and React 19 installation. Add scripts `test: vitest` and `test:run: vitest run`.

Update `vite.config.ts` to import defineConfig from `vitest/config`, retain its React and Tailwind plugins and source alias, and configure the jsdom test environment and `src/test/setup.ts` setup file. In that new setup file import `@testing-library/jest-dom/vitest` and register React Testing Library cleanup with Vitest afterEach. Tests import Vitest APIs explicitly rather than adding test globals to the application TypeScript configuration.

Add `src/domain/fieldSummary.test.ts` covering these consumer-visible rules with small isolated fixtures:

- Zero and negative readings trigger frost risk; a positive-only field does not.
- January 9 and January 15 are included for AS_OF_DATE January 15; January 8 and January 16 are excluded.
- Null-only/missing readings produce unknown risk, not zero; data joins do not leak another field's readings.
- A reading yesterday (including 0) prevents offline status; null/missing readings on both recent days trigger offline status.
- Trend skips missing days and handles equal readings and insufficient data.

Add `src/App.test.tsx` with controlled module-boundary mocks of getFields/getStations/getReadings, retaining the real API types, AS_OF_DATE, and addDays. Never edit the mock API for deterministic tests. Clear localStorage, use a fresh QueryClient/provider per test, reset mocks, and clean up observers and query timers between tests. Use fake timers and controlled randomness for backoff tests; restore timers/randomness afterward and configure userEvent timer advancement. Keep the specified production retry policy enabled in retry scenarios.

- Hold a request pending to assert loading. Resolve fixture data for one positive field and one frost-risk field; assert risk-first order and the displayed minimum. Use userEvent keyboard tab/Enter to select the frost field; assert its station's dated lows, missing label, offline status, and trend text are visible.
- Reject getReadings on its first attempt, then resolve it: assert automatic recovery shows data without manual Retry or a terminal alert. Separately exhaust all four attempts, assert an inline unavailable message inside the persistent shell, activate Retry, and resolve successfully. Assert each query retry restarts earlier endpoints, while concurrent observers and manual refresh during an active request do not start a second pipeline.
- Resolve an empty field list and assert the explicit empty state. Include a field with no stations and an all-null station in additional cases to prove those distinct empty/missing paths.
- Prepopulate a valid persisted snapshot and hold refresh pending: assert rows are visible immediately and field selection works. Exhaust the refresh attempts: assert the same values and selected detail remain visible with the non-blocking warning. Retry successfully with changed fixture temperatures and assert visible data and localStorage both update. Remount with the saved snapshot and failing API to prove reload persistence.
- Test malformed JSON, wrong date/version, and storage throwing on access: no crash, normal fetch proceeds. Test a successful empty refresh replaces an older nonempty snapshot, while a failed refresh does not. Assert concurrent refresh/StrictMode consumers share one in-flight pipeline.
- Extend keyboard coverage to assert selection with Enter and Space, `aria-pressed`, focus retention on selection and the persistent Refresh/Retry button, and no focus stealing by background completion. Query controls by role and accessible name. Check captions/headers, visible risk/offline labels, and announced loading/exhaustion/selection text.

## Verification

Dashboard implementation commands run from the repository root, with no external services, secrets, or environment variables required. After implementation run `npm run test:run` and `npm run build` once. Tests must exercise behavior above, not inspect source text or implementation wiring.

Launch `npm run dev -- --host 127.0.0.1` and open its reported URL in a browser. With the real API and supplied FAILURE_RATE, retry any transient error. For the supplied fixture, the range must be January 9–15, 2027; South Slope has minimum −3°C and River Flats −2°C, both marked Frost risk and ahead of other fields. Creekside has minimum 0.5°C and is not marked Frost risk. These expectations follow the supplied generated data, not the wall clock.

After a real successful load, reload the page and confirm saved rows appear while refresh is in progress and the last-success time is visible. Use deterministic integration scenarios above to prove all-failure refresh preserves data, retry backoff terminates, and invalid/unavailable storage degrades safely; do not modify the backend to force these scenarios.

Using keyboard only, activate the skip link, navigate the field controls with Tab/Shift+Tab, select River Flats with Enter and another field with Space, and verify no focus trap or lost focus. Confirm S-03 is Offline, January 14–15 show No reading, and January 12 is missing for every station. Verify selected-state announcements, readable heading/table structure with VoiceOver, focus visibility, and keyboard access to any overflowing table. Inspect at 320 CSS pixels and 200% zoom; measure actual text/status/focus contrast against the specified thresholds rather than assuming the library defaults suffice. Check that risk remains understandable without color and that all station data is available without hover. The deterministic integration retry test proves error recovery and post-retry focus without changing the API's random failure rate.

## Assumptions and contingencies

- Frost risk is any station daily low ≤0°C within the same seven-day window used by the overview. This is the user's rule; it is not crop-specific forecasting.
- `Recent` station history means those same seven days. Offline requires no valid report on either of the two most recent dates, not a missing report on just one of them.
- Missing daily values remain missing in both analysis and presentation: no interpolation. Ignore them for minima/risk/trend, show `No reading` and the missing-data warning, and explain the limits in README.
- Use Vitest as the test runner, React Testing Library for component/integration tests, and user-event for user interactions. Required minimum: a frost-risk unit test covering the inclusive zero threshold, null exclusion, and seven-day boundaries; and an integration test proving cached data stays visible after exhausted refresh retries and updates after successful manual Retry. The broader behavioral cases in step 4 extend this minimum rather than substituting build checks or snapshots for meaningful tests.
- Primary-story coverage: add domain fixtures where field daily minima imply cooling despite a warming individual station; assert the field trend uses daily minima and its comparison dates skip missing days. Test station ordering with negative, zero, positive, tied, and all-null minima. Extend the component test to assert the field's trend and the coldest station are immediately identifiable, and an offline station remains labeled after sorting. In browser verification, answer all three grower questions from the overview and one field selection without inspecting raw API data.
- Persist complete successful snapshots in localStorage keyed by AS_OF_DATE and schema version, with an in-memory fallback when storage is unavailable. Revalidate on mount and explicit Refresh/Retry; retain valid cached data on failure. Without any prior successful snapshot, show an informative dashboard shell rather than inventing readings.
- The backend owns data completeness and random failures. Document limitations or suggested backend improvements in README instead of modifying API behavior. Leave the API file unchanged for delivery.
