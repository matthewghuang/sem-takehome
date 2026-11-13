# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## UI foundation

Install dependencies with `npm ci`, then run `npm run dev` for the hello-world screen or `npm run build` for the production build.

- Tailwind CSS v4 runs through `@tailwindcss/vite` alongside the React plugin.
- `@/` resolves to `src/` in Vite and TypeScript; the TypeScript paths mappings do not use `baseUrl`.
- shadcn/ui uses the Radix Nova preset, neutral colors, CSS variables, and TypeScript. Configuration lives in `components.json`; generated theme imports remain in `src/index.css`.
- Generated Button, Table, Badge, Card, Alert, and Skeleton components live in `src/components/ui`. Import the shared `cn` utility from `@/lib/utils`.
- TanStack Query and Table are installed for later dashboard increments; they are not connected to the hello-world screen yet.

The stock Vite screen has been replaced with a small shadcn Card, Badge, and Button demo. `Say hello` announces a greeting; `Reset greeting` restores the initial message. The obsolete starter styles have been removed, leaving the generated theme and Tailwind utilities. StrictMode is retained; dashboard implementation and API changes are not part of this screen.

## Domain analysis (Increment 2)

`src/domain/fieldSummary.ts` exports `summarizeFields` and its view-model types. This analysis is unit-tested but is not yet connected to the hello-world screen; data loading and dashboard UI remain later increments. The supplied mock API is unchanged.

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

The targeted suite passes 20 cases covering window boundaries, inclusive zero risk, null/missing data, joins, no input mutation, offline semantics, both trend levels, changing reporting stations, and deterministic ordering. `npm test` starts Vitest in watch mode; React Testing Library and jsdom are configured for later UI increments.

Adversarial coverage also checks that a colder second station determines field minimum/risk without overwriting individual histories, older readings determine station minima and ordering, and field name/id ordering wins over unknown/safe category grouping and frost severity. These are assertions in the existing 20 cases, not additional test cases.

## Snapshot loading (Increment 3)

`src/data/fieldData.ts` exports the raw `Snapshot` type and `fieldSnapshotQueryOptions`. The query loads fields, then batches their ids into the station request, then batches station ids into the readings request for January 9–15, 2027. Empty fields skip both later requests; fields without stations skip readings while remaining in the snapshot.

Only a complete successful pipeline becomes query data. `fetchedAt` records completion time, separately from the fixed measurement date. A rejected endpoint publishes no partial snapshot. TanStack Query allows four attempts total, restarting the entire pipeline each time. The three retry delays are 1, 2, and 4 seconds plus independently sampled integer jitter from 0–250 ms; retries stop after exhaustion. There is no endpoint retry helper or polling.

The shared options disable focus/reconnect refresh and use `networkMode: 'always'` for the self-contained mock API. Increment 3 introduced the query without React integration; Increment 5 connects the client and hook as described below. The hello-world screen and API remain unchanged.

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

The hello-world screen deliberately does not consume the hook yet, so opening it does not start API requests. The live overview is Increment 6. Without a saved snapshot, an all-failure first visit cannot show real field data.

```sh
npm run test:run -- src/hooks/useFieldData.test.tsx
npm run build
```

The hook/client suite passed 14 cases covering first-render hydration, refresh/retry transitions, retained data and timestamps, empty replacement, concurrent/StrictMode consumers, unmount completion, optional or invalid storage, delayed observers, and success-only persistence. The provider-mounted hello-world screen was also checked in the browser.

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
