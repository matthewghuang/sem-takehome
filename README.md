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
