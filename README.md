# Frost Monitor

A React/TypeScript field frost dashboard using shadcn/ui, TanStack Query, and TanStack Table. Measurements use the fixed reference date January 15, 2027, not the computer clock.

## UI foundation

Install dependencies with `npm ci`, then run `npm run dev` for the dashboard or `npm run build` for the production build.

- Tailwind CSS v4 runs through `@tailwindcss/vite` alongside the React plugin.
- `@/` resolves to `src/` in Vite and TypeScript; the TypeScript paths mappings do not use `baseUrl`.
- shadcn/ui uses the Radix Nova preset, neutral colors, CSS variables, and TypeScript. Configuration lives in `components.json`; generated theme imports remain in `src/index.css`.
- Generated Button, Table, Badge, Card, Alert, and Skeleton components live in `src/components/ui`. Import the shared `cn` utility from `@/lib/utils`.
- TanStack Query manages the complete snapshot lifecycle; TanStack Table v9 supplies the typed, core-only overview model. No virtualization, filtering, user sorting, or pagination is added.

The dashboard includes a live field overview and inline station detail. StrictMode and the generated theme are retained. Native field-name buttons select detail without another API request. The mock API remains unchanged.

## Domain analysis (Increment 2)

`src/domain/fieldSummary.ts` exports `summarizeFields` and its view-model types. The React hook derives these summaries from successful snapshots, and the overview displays their risk-first order, minima, and dated trends. The supplied mock API is unchanged.

- Analysis uses the supplied reference date, not the machine clock. For `AS_OF_DATE = 2027-01-15`, the inclusive seven-day window is January 9–15, 2027.
- Any station minimum ≤0°C makes its field `at-risk` (Frost risk). A positive minimum means `no-frost-observed` (No frost observed). No numeric readings, including fields without stations, means `unknown` (No data).
- Missing records and explicit nulls stay missing. Nothing is interpolated, forward-filled, or replaced by zero. This avoids inventing observations, but frost events on unreported days can be missed: No frost observed is not a guarantee of no risk or a forecast.
- A station is Offline only when neither the reference date nor the preceding day has a numeric report. Zero is a valid report. An older cold reading still contributes to risk even if that station is now offline.
- Station trends compare the latest two non-null daily lows. Field trends compare the latest two non-null daily minima across that field's stations; reporting stations can differ between dates. The signed change is newer minus older, with both comparison dates retained. These are observed changes, not whole-week regressions or forecasts. Fewer than two numeric dates gives an insufficient trend.
- Fields are ordered frost-risk first, then by name and id. Stations are ordered by seven-day minimum, nulls last, then label and id. All-missing stations retain seven null daily entries, unknown field risk, insufficient trends, and Offline status.

### Domain verification

Use Node 22.12+ on the Node 22 line, or Node 24+, within Vitest's supported engine ranges. The local Node 23.8 installation passed the checks below but produces an unsupported-engine warning when installing Vitest 4.

```sh
npm run test:run -- src/domain/fieldSummary.test.ts
npm run build
```

The targeted suite passes 20 cases covering window boundaries, inclusive zero risk, null/missing data, joins, no input mutation, offline semantics, both trend levels, changing reporting stations, and deterministic ordering. `npm test` starts Vitest in watch mode; React Testing Library and jsdom run the App and hook integration suites.

Adversarial coverage also checks that a colder second station determines field minimum/risk without overwriting individual histories, older readings determine station minima and ordering, and field name/id ordering wins over unknown/safe category grouping and frost severity. These are assertions in the existing 20 cases, not additional test cases.

## Snapshot loading (Increment 3)

`src/data/fieldData.ts` exports the raw `Snapshot` type and `fieldSnapshotQueryOptions`. The query loads fields, then batches their ids into the station request, then batches station ids into the readings request for January 9–15, 2027. Empty fields skip both later requests; fields without stations skip readings while remaining in the snapshot.

Only a complete successful pipeline becomes query data. `fetchedAt` records completion time, separately from the fixed measurement date. A rejected endpoint publishes no partial snapshot. TanStack Query allows four attempts total, restarting the entire pipeline each time. The three retry delays are 1, 2, and 4 seconds plus independently sampled integer jitter from 0–250 ms; retries stop after exhaustion. There is no endpoint retry helper or polling.

The shared options disable focus/reconnect refresh and use `networkMode: 'always'` for the self-contained mock API. Increment 3 introduced the query without React integration; Increment 5 connects the client and hook as described below. The supplied API remains unchanged.

```sh
npm run test:run -- src/data/fieldData.test.ts
npm run build
```

The targeted suite passes 10 cases using fresh QueryClients, module-boundary endpoint mocks, fake timers, and controlled randomness. Coverage includes sequential batching, atomic publication, empty results, transient recovery with changed identifiers, four-attempt exhaustion at each endpoint, and exact retry timing at minimum, intermediate, and maximum jitter.

## Snapshot persistence (Increment 4)

`src/data/fieldData.ts` now exports `readSavedSnapshot()` and `saveSnapshot(snapshot)`. They use the exact localStorage key `frost-indicator:field-snapshot:v1:2027-01-15`, keeping raw fields, stations, and readings rather than derived summaries. Call `saveSnapshot` only with a complete successful query result.

- Reads validate schema version, the fixed reference date, a parseable fetch timestamp, arrays, nonempty required strings, finite numeric-or-null temperatures, and real ISO calendar dates. Field/station ids must be unique; station-to-field and reading-to-station references must resolve.
- An absent, malformed, or mismatched entry returns `null`. There is no expiration for valid fixed-date observations. The React hook recomputes domain summaries from each successful raw snapshot.
- Storage access, JSON parsing/serialization, quota, and write failures are caught. Invalid writes do not replace a valid saved snapshot. Complete successful empty results can replace older populated snapshots.
- These helpers remain outside the retryable query function. Storage failures cannot initiate network retries or discard a successful in-memory query result. Storage is same-origin/device only and cannot guarantee data on a first visit.

Increment 5 connects these helpers to one-time client hydration and a success-only persistence subscription, keeping them outside retryable network work.

```sh
npm run test:run -- src/data/fieldPersistence.test.ts src/data/fieldData.test.ts
npm run build
```

Both data suites passed 109 cases, covering snapshot acceptance/rejection, overflowing JSON numbers, invalid-write retention, serialization and storage failures, authoritative empty replacement, and the existing loader/retry behavior.

## Query client and React hook (Increment 5)

`src/data/queryClient.ts` creates one application-lifetime `queryClient` before React renders. `src/main.tsx` provides it through `QueryClientProvider`, retaining StrictMode. The same `createFieldQueryClient()` factory gives each integration test an isolated client.

- Client creation reads and validates storage once, seeding the snapshot query synchronously with `fetchedAt` as its update time. Infinite cache retention applies even before the first observer mounts.
- `src/hooks/useFieldData.ts` exports `useFieldData()` and its `FieldData` result type. The hook returns summaries, the last-success time, refresh status, a terminal error message, and a guarded `refresh()` callback. Summaries are memoized by snapshot identity.
- Mounting a hook refreshes stale data in the background. Query owns concurrent-request and StrictMode deduplication; repeated Refresh calls during an active request are no-ops. No polling, custom store, or cancellation layer is added.
- Refresh failures retain previous summaries and their timestamp. Without a successful snapshot, fields remain `null`; successful empty results yield `[]`. Retry starts a new complete pipeline after settlement, clearing the terminal warning while refreshing.
- One cache subscription saves only successful network results for the snapshot key. Hydration, manual cache writes, unrelated queries, retry/status changes, and exhausted failures do not write storage. A request can finish and save after all observers unmount.

The live overview consumes the hook on mount, immediately displaying validated saved rows while refreshing in the background. Without a saved snapshot, an all-failure first visit cannot show real field data.

```sh
npm run test:run -- src/hooks/useFieldData.test.tsx
npm run build
```

The hook/client suite passed 14 cases covering first-render hydration, refresh/retry transitions, retained data and timestamps, empty replacement, concurrent/StrictMode consumers, unmount completion, optional or invalid storage, delayed observers, and success-only persistence.

## Live overview and resilient shell (Increment 6)

`src/App.tsx` keeps the heading, fixed measurement date/window, overview table, and station-detail region mounted through loading, refresh, empty, and failure states. `src/components/FieldOverview.tsx` uses TanStack Table v9's `useTable`, stable module-scoped typed columns, and field-id row keys. All rows render normally through shadcn's semantic Table components.

- Overview columns show Field, Crop, Coldest daily low (°C), Frost status, and Recent trend. Visible labels distinguish Frost risk, No frost observed, and No data. Trends include direction, signed change, and both comparison dates; cooling arrows are blue, warming arrows orange, and steady arrows neutral. Text labels remain visible so color is supplementary. Missing measurements never become zero.
- Initial loading uses decorative skeletons with one polite status message. Exhausted first-load failure shows an inline alert and Retry, not a replacement error screen. A successful empty response says `No fields available.`
- Saved rows and the last-success timestamp remain visible during refresh and after failure. One persistent Refresh/Retry button uses `aria-disabled`, rather than removing keyboard focus, during requests.
- The skip link targets the main landmark. Section headings, a caption, scoped column headers, and a named keyboard-focusable table overflow region provide structure. The Table primitive accepts `containerProps` to put focus and labeling on its actual scroll container.
- Table cells have one roving Tab stop. From the scroll region, Tab enters the current cell or field-name button; arrow keys move between headers, cells, and field buttons without wrapping. Home/End move to the row edges, Ctrl+Home/End to the table edges, and Tab/Shift+Tab exit normally. Loading skeletons and empty-state messages are skipped. Stable field ids preserve cell focus across refresh/reordering; if a field disappears, the same header column becomes the next cell entry.
- Arrow navigation alone does not select a field. Enter/Space on its native button, a button click, or a click anywhere in its data row selects it. Row clicks focus the field-name button so keyboard navigation can continue; rows retain native table semantics and a selected-row tint.

```sh
npm run test:run -- src/App.test.tsx
npm run build
```

The overview's loading, recovery, cached-data, and keyboard-navigation scenarios remain covered by the App integration suite. User-event uses a local async wrapper because this installed Testing Library version detects Jest timers, not Vitest timers.

Real-API browser checks confirmed River Flats −2°C and South Slope −3°C as the first two frost-risk rows, and Creekside 0.5°C with No frost observed. Reload showed all eight saved rows and the last-success time during background refresh. Skip-link navigation and keyboard Refresh retained focus. Error exhaustion/recovery was verified deterministically in tests, without changing the API's failure rate.

Final viewport, contrast, target-size, and screen-reader verification evidence is recorded under Increment 8 below.

Cell navigation was checked in the real browser at 320 CSS pixels: Tab entered the Field header, Down reached River Flats, Right reached its crop, and End focused its dated trend while automatically scrolling it into view. Ctrl+Home/End reached the table edges, Shift+Tab returned to the scroll region, and normal Tab exited the cells without a trap. The focused cell had a visible 2-pixel outline; the document remained 320 pixels wide and no browser errors were reported.

## Field selection and station detail (Increment 7)

App stores only the selected field id and resolves it against the current summaries. Selection buttons expose `aria-pressed` and `aria-controls="field-detail"`; the persistent polite status announces the selected name alongside request transitions. No selection triggers a network request or moves focus into detail.

Whole-row pointer selection is available on crop, minimum, status, trend, and row background areas. Headers, captions, loading placeholders, and empty-state rows do not select fields. The row-click update passed all 26 App integration cases and the build. Tests verify no extra API requests; real-browser checks confirmed pointer selection followed by keyboard selection.

`src/components/FieldDetail.tsx` shows the selected field's dated trend and changing-reporting-stations caveat, followed by coldest-first shadcn station cards. Each card has a station heading, Reporting/Offline label, seven-day minimum, dated trend, and all seven chronological daily lows. Nulls say `No reading`; no-data stations remain visible last. The missing-data note is informational, not a second network alert. Fields without stations have a distinct empty message.

Selection and detail remain usable while refreshing and after exhausted failures. Retry replaces both overview and selected detail from one successful snapshot. If the selected id disappears, the detail region returns to its prompt rather than displaying stale content. Reload persists raw observations, not the selection: saved rows appear immediately, can be selected during background refresh, and recompute detail from the saved snapshot.

All 24 App integration cases and the build passed. Coverage includes Enter/Space and button focus, exact field comparison dates, station order and offline/missing histories, all-missing/no-station/complete-history distinctions, selected-detail retention and Retry updates, selection disappearance, reload hydration, and malformed/mismatched/blocked storage.

Real-API keyboard review selected River Flats with Enter and South Slope with Space while retaining trigger focus. River Flats showed cooling by 1°C from January 14 to 15; S-02/S-03/S-04/S-05 tied for its coldest seven-day minimum, with S-03 still marked Offline. S-03 had no readings on January 14–15, and all five displayed stations had no reading on January 12. At 320 CSS pixels, all five station histories retained seven entries and the document had no horizontal overflow. Reloaded saved rows remained selectable during refresh, and completion did not steal focus from the selected field button. No browser errors were reported.

## Final acceptance review (Increment 8)

Increment 8 automated run: **167 tests passed across five files**; `npm run build` passed. The subsequent row-click update was checked with the targeted App suite described above.

The final browser review used the real mock API at its supplied `FAILURE_RATE = 0.05`; no API implementation or failure-rate changes were made. No UI defects were observed that required production changes in this increment.

### Functional and keyboard evidence

- The visible window was January 9–15, 2027. River Flats and South Slope appeared first with Frost risk; Creekside showed No frost observed. The overview and one River Flats selection exposed field cooling, tied coldest stations, and the offline S-03 without raw API inspection.
- Reload displayed eight saved rows and the last-success timestamp while background refresh was still active. Selecting River Flats with Enter and South Slope with Space worked during that refresh; focus remained on South Slope after completion.
- The skip link focused the main landmark. Tab/Shift+Tab entered and left the table without a trap. Arrow keys, Home/End, and Ctrl+Home/End moved between headers, cells, and field buttons; overflow scrolled the focused cell into view.
- The browser accessibility tree exposed one h1, section h2s, station h3s, a captioned semantic table with five column headers, pressed field buttons, named detail, and seven dated term/definition pairs per station. One persistent atomic polite status contained request and selection text. Missing-data information was a note, not a duplicate error alert. Native VoiceOver speech is not claimed by this inspection.
- Frost/offline statuses and trend directions remained understandable through visible text rather than color or hover. All five River Flats histories retained seven entries; S-03 showed No reading on January 14–15 and every station showed No reading on January 12.

### Layout and zoom

Chrome's native **Page zoom** setting was set to **200%**, then restored to 100% after the check. This was not a CSS transform or device-pixel-ratio-only simulation. The zoomed overview, field selection, trend comparison, missing-data note, and station cards remained readable; keyboard navigation still worked.

| Browser check | CSS viewport width | Document scroll width |
| --- | ---: | ---: |
| Narrow WebKit viewport | 320 px | 320 px |
| Native Chrome 200% zoom | 640 px | 640 px |

Horizontal overflow was confined to the overview's scroll region in both checks, not the document.

### Measured light-theme contrast and targets

Contrast used actual computed colors composited over their rendered ancestor backgrounds, converted through canvas sRGB pixels to WCAG relative luminance.

| Sample | Contrast | Minimum |
| --- | ---: | ---: |
| Muted text, dates, and station minima on white | 4.95:1 | 4.5:1 |
| Muted text on the selected-row tint | 4.83:1 | 4.5:1 |
| Status text | 19.56:1 | 4.5:1 |
| Frost risk badge | 17.96:1 | 4.5:1 |
| No frost observed / Reporting badges | 16.60:1 | 4.5:1 |
| Offline badge | 19.56:1 | 4.5:1 |
| Active focus outline | 18.42:1 | 3:1 |
| Decorative trend arrows, lowest contrast | 4.95:1 | 3:1 |

Field buttons, cells, and the table region had visible 2-pixel focus outlines. Interactive controls exceeded the 24×24 CSS-pixel target requirement:

| Control | Width | Height |
| --- | ---: | ---: |
| Smallest field button | 44.47 px | 32 px |
| Refresh | 72.89 px | 32 px |
| Skip link | 183.64 px | 40 px |

### Verification limit

**VoiceOver listening/navigation remains unverified.** VoiceOver was not running, and the read-only macOS `System Events` accessibility check returned `UI elements enabled = false`. Browser accessibility-tree and live-region checks passed, but do not replace a human VoiceOver review. No full WCAG 2.2 AA conformance claim is made.

### Final automated verification

Run from the repository root; no external services, secrets, or environment variables are required:

```sh
npm run test:run
npm run build
```

The deterministic tests cover exhausted retries, retained snapshots/detail, successful Retry, invalid or unavailable storage, and focus through request transitions without modifying the backend to force errors.

### Backend limitations and proposed improvements

- Saved snapshots are optional, same-origin/device browser storage. Storage can be unavailable or evicted; without a prior successful snapshot, an all-failure first visit cannot display real readings. The in-memory query still works when persistence fails.
- No cache expiration is appropriate for this fixed-date exercise, not a live production freshness policy. A real backend should expose measurement/fetch freshness, a snapshot revision or ETag, and ideally one consistent snapshot response across fields, stations, and readings.
- Production errors should identify retryable failures and supply retry timing where appropriate. The current mock provides only rejected promises, so bounded Query retries restart the whole pipeline.
- Missing observations can hide frost events, and inferred Offline means no numeric reports on the last two dates—not confirmed station hardware failure. Backend report timestamps/quality flags and unique station/date readings would make those distinctions explicit.
- Query and Table do not reduce the complete snapshot payload. If data volume requires it, server-side paging/windowing and batched query endpoints belong in the backend contract rather than changing this exercise's mock API.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
