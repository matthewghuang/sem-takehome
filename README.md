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

The shared options disable focus/reconnect refresh and use `networkMode: 'always'` for the self-contained mock API. This increment does not create an application QueryClient or connect fetching to React. Persistence, hydration, and the data hook remain later increments; the hello-world screen and API are unchanged.

```sh
npm run test:run -- src/data/fieldData.test.ts
npm run build
```

The targeted suite passes 10 cases using fresh QueryClients, module-boundary endpoint mocks, fake timers, and controlled randomness. Coverage includes sequential batching, atomic publication, empty results, transient recovery with changed identifiers, four-attempt exhaustion at each endpoint, and exact retry timing at minimum, intermediate, and maximum jitter.

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
