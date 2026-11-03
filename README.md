# NetXMS Web Console

A Vue 3 single-page management console for the [NetXMS](https://netxms.org) network
monitoring system, communicating with the NetXMS server over its WebAPI (REST/JSON).

It is a ground-up redesign of the legacy Java/RWT desktop client, covering the object tree,
alarms, data collection, dashboards, network maps, logs, and server configuration.

**Status: early development.** Interfaces and layout still change frequently, and some views
are stubs behind an "under construction" overlay.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- Yarn 4 (via Corepack — `corepack enable`)
- A reachable NetXMS server with the WebAPI component enabled

## Setup

```sh
yarn
```

Point the dev server at your NetXMS server by creating a `.env.local`:

```sh
VITE_API_TARGET=https://your-netxms-server/api
```

The dev server proxies `/api` to that target (defaulting to `http://localhost:8000`), so the
browser sees a same-origin API and no CORS configuration is needed on the server.

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Start the Vite dev server |
| `yarn build` | Production build (set `VITE_SOURCEMAP=true` for sourcemaps) |
| `yarn preview` | Serve the production build locally |
| `yarn test:unit` | Run unit tests (Vitest, jsdom) |
| `yarn lint` | Lint and autofix (oxlint, then ESLint) |
| `yarn format` | Format `src/` with oxfmt |

`yarn test:parity` runs the optional round-trip tests for dashboards and network maps against
a live server. They are skipped unless connection details are supplied:

```sh
NETXMS_URL=http://your-server:8000 NETXMS_USER=admin NETXMS_PASSWORD=... yarn test:parity
```

### Running without a server

Set `VITE_USE_MOCKS=true` to serve `/api` from the static fixtures in `mocks/` instead of a
real server. A module listed in `VITE_MODULES` can ship its own fixtures in
`src/modules/<id>/mocks/`, which are checked before `mocks/`. The fixtures are served by the dev
server and the demo Docker image, and are never part of a bundle.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Base path the app calls |
| `VITE_API_TARGET` | `http://localhost:8000` | Dev/preview proxy target |
| `VITE_USE_MOCKS` | `false` | Serve the API from `mocks/` |
| `VITE_MODULES` | empty | Enterprise modules compiled into the build, e.g. `example`. Each module is a separate checkout of its own repository at `src/modules/<id>/`, which git ignores; an unknown id fails the build |
| `VITE_FORCE_MODULES` | empty | Show these compiled-in modules even when the server does not report their component |
| `VITE_DEMO_CONTENT` | on in `yarn dev` and `--mode demo`, off in release builds | Demo maps and dashboards and the map demo toolbar |
| `VITE_THEME_PICKER` | `true` | `false` removes the color theme picker; the default theme applies |
| `VITE_MAX_CONCURRENT_REQUESTS` | `6` | Requests the console keeps in flight at once |
| `VITE_SOURCEMAP` | `false` | Emit sourcemaps from `yarn build` |

## Building and deploying

[`deploy/README.md`](deploy/README.md) covers release and demo bundles and the nginx host setup;
[`docker/README.md`](docker/README.md) the Docker images (console, and a demo on mock data). In
short: `yarn build` for a release bundle, `yarn build --mode demo` for a demo bundle, served by
nginx with `deploy/nginx/`.

## Architecture

```
Router (src/router/)      Route definitions and auth guards
  Views (src/views/)      Page-level components, lazy-loaded
  Components              Reusable UI, built on PrimeVue
  Composables             Shared reactive logic

Queries (src/queries/)    TanStack Query - all server state, cached and refetched
  API (src/api/)          HTTP layer, one module per WebAPI domain
Stores (src/stores/)      Pinia - client-only state (selections, UI preferences)

Modules (src/modules/)    Enterprise modules, one folder each; compiled in per build
                          (VITE_MODULES), shown only when the server has the component
```

Server state lives in TanStack Query, never in Pinia. All HTTP goes through `src/api/` —
components and stores never call `fetch` directly.

Built with Vue 3 (Composition API, `<script setup>`), Vue Router, Pinia, TanStack Query,
PrimeVue, ECharts, and Cytoscape. JavaScript, not TypeScript. Linting with oxlint and ESLint;
formatting with oxfmt.

PrimeVue stays on 4.x (with `@primeuix/themes` 2.x and `primeicons` 7.x): those are MIT, while
PrimeVue 5, `@primeuix/themes` 3 and `primeicons` 8 moved to the commercial PrimeUI License. Don't
`yarn up` them to `latest`; `yarn up primevue@^4` stays on the 4.x line.

`CLAUDE.md` documents the conventions in more detail.

## Recommended editor setup

### VS Code

[VS Code](https://code.visualstudio.com/) with [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
(disable Vetur) and the oxc extension. See `.vscode/extensions.json`.

### Zed

Install the **Vue** and **Oxc** extensions (`zed: extensions`). ESLint, EditorConfig and Vitest
(gutter run buttons) work out of the box. Project settings are in `.zed/settings.json`.

## License

Copyright (c) 2003-2026 Raden Solutions.

Licensed under the GNU General Public License, version 2 or (at your option) any later version.
See [`LICENSE`](LICENSE).
