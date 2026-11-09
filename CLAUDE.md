# NetXMS web console

Vue 3 SPA replacing the legacy Java/RWT NetXMS client. Talks to the server only via the WebAPI
(REST/JSON). Env vars and mocks (`VITE_USE_MOCKS`): `README.md`.

## Commands

yarn only (no npm/pnpm).

```
yarn dev                # Vite dev server
yarn build              # Release build, no demo content
yarn build --mode demo  # Demo maps/dashboards (.env.demo)
yarn test:unit          # Vitest (jsdom)
yarn test:parity        # Live parity specs; needs NETXMS_URL/USER/PASSWORD
yarn test:e2e           # Playwright, headless Chromium; NETXMS_USER/PASSWORD in .env.local, or VITE_USE_MOCKS=true
yarn test:e2e:gallery   # Same setup; every main screen, light/dark/narrow, in e2e/.gallery/index.html
yarn lint               # oxlint + ESLint with --fix (rewrites files); must pass
yarn lint:ci            # Same, no fixing
yarn format             # oxfmt over src/
```

## References (github.com/netxms/netxms, `master` unless targeting a release branch)

Check these instead of working from memory when touching an endpoint or mirroring a legacy view:
- WebAPI spec: `src/server/webapi/openapi.yaml`; handler `*.cpp` in the same dir when ambiguous.
- Legacy client (behavior parity): `src/client/nxmc/java/src/main/java/org/netxms/nxmc/modules/`
- Shared constants (access masks, object classes, limits): `include/nxcldefs.h`

## Verification

- Run targeted `yarn test:unit` when logic changed (not for styling/layout).
- `yarn test:e2e` (`e2e/`) covers behavior a jsdom spec cannot see: real layout, navigation,
  drag, several accounts. On a real server `e2e/fixtures.js` refuses every write except to `e2e-`
  items the test created itself, and keeps preferences in the browser. New specs import `test` from
  there, never from `@playwright/test`.
- No pixel baselines. The rest of the UI is verified against a real server. Check empty, error
  and long-name states, light and dark theme.

## UI conventions

- Match the closest sibling view/section/dialog (layout, components, spacing). Check
  `src/components/common/` and general-purpose views (e.g. Properties) first; one-off layouts
  get reverted.
- NXSL script fields: shared script editor + Compile button + hint block ("Variables:",
  "Return value:"). Copy from the DCI transformation script section.
- Not-yet-available features: under-construction overlay/banner or `notifyNotImplemented`.
- Large tables: `AppTable`, not PrimeVue DataTable (performance).
- Filter inputs carry `data-filter-input` (target of the global `/` shortcut, see
  `useFilterShortcut`). Prefer `SmartFilterInput`, which sets it.
- Persisted UI state: consolidated keys in `src/utils/appStorage.js`, never one key per view.
  - `userPrefs`: taste or user content (theme, columns, display modes, saved items); synced to
    server user variables `webui.*`. Copies of a value re-read it on `userPrefs.revision`.
  - `prefs` / `tables`: screen-dependent (widths, collapsed panels, page sizes).
  - `viewState`: where this tab is.
- Navigation must support ctrl/cmd+click and middle click: route from a builder in
  `src/utils/routeTargets.js`, bind with `useNavTarget().navBindings(target, existingHandler)`.
  Row/node components take a `targetFor` prop (`AppTable`, `ObjectTreeNode`, `ViewTabBar`,
  status maps). Use real anchors (`AppLink`, PrimeVue `Button as="a"`) when there is no nested
  interactive content. No inline modifier-key handling.

## Architecture

- HTTP only through `src/api/` (`<domain>Api.js`, e.g. `alarmsApi.js`); `client.js` owns auth,
  reconnect, error normalization. No `fetch` in components or stores.
- Server state: TanStack Query composables in `src/queries/` (`use<Name>Queries.js`); cache
  tiers in `src/queries/config.js`.
- Pinia setup-style stores (`<name>Store.js`): client-only state.
- Registries: object views, property sections, overview cards, server components in
  `src/config/`; context-menu actions in `src/actions/`.
- Route views lazy-loaded. `<script setup>` only. JavaScript + JSDoc, no TypeScript. `@/` alias.
- PrimeVue-based components, `PascalCase.vue`, grouped by feature in `src/components/`.
- PrimeVue stays on 4.x, `@primeuix/themes` 2.x, `primeicons` 7.x (MIT); later majors are under
  the commercial PrimeUI License. Never bump them across a major.
- Tests: `*.spec.js` in a co-located `__tests__/`.
- Comments: only what the code cannot say (non-obvious why, server/WebAPI/legacy-client or
  library quirk, unit/format), one or two lines. No restating code, history ("used to", plans,
  tickets, reviews), rationale essays, pointers to docs outside the repo, facts that drift
  (counts, "the three tests below", lists of callers, line numbers), or cross-references to
  other comments or positions ("see above", "the mock below", "see the header": state the fact
  where it is needed). JSDoc for types
  only where not obvious. Code that needs a long comment to follow gets a refactor item in
  `docs/backlog/` instead.

## Enterprise modules (`src/modules/<id>/`)

- Manifest `index.js`: `id` (= folder name), `requiredComponent`, contributions (`objectViews`,
  `overviewCards`). Module has its own `api/`, `queries/`, `components/`, `views/`, `utils/`,
  `__tests__/`, `mocks/`.
- Each module is a separate private repo cloned as a real folder (no symlink); git ignores it.
  Lint/tests/mocks include any present checkout. Dev: `VITE_MODULES=<id>` and
  `VITE_FORCE_MODULES=<id>` in `.env.local`. Public bundles/images: build from a clean checkout
  (the Docker context includes any present module folder).
- `VITE_MODULES` (empty by default) selects compiled-in modules via `vite-plugin-netxms-modules.js`;
  unknown id fails the build.
- Active iff `/v1/server-info` `components` lists `requiredComponent`, or `VITE_FORCE_MODULES`
  names it (does not affect `useServerComponents`, so cannot fake AI).
- Inactive module UI is omitted entirely, never shown as "hidden by your permissions".
- Core imports only `@/modules`. A build fails if a non-enabled module's file reaches the bundle.
  Modules import core freely, never each other (not machine-checked); imports inside a module are
  relative.
- Module mocks: served (with `VITE_USE_MOCKS=true`) in `VITE_MODULES` order before core
  `mocks/`; each folder's full lookup runs first, so a module wildcard beats a core exact file.
  Once a module file matches, core is not consulted, so a module mock that needs core data reads
  the core fixture file itself. Dev server only: any build fails if a module mock is bundled.
  `yarn format` formats module mock JSON but not core `mocks/`.
- New extension point: manifest key + merge in the owning registry + `moduleRegistry.getModuleState`
  check (see `src/config/objectViews.js`). Every module ships a manifest spec running the
  registry's validator.
- AI is not a module: per-surface `SERVER_COMPONENTS.AI_ASSISTANT` gates. Nothing else gates
  features at build time.

## Product identity

- Name, logos, favicon, themes only from `@/brands` (`brand.productName`, `brand.logo`,
  `brand.themes`); never hardcoded.
- UI wording and demo content (`mocks/` seeds under `VITE_DEMO_CONTENT`): "the server" / "your
  administrator", not "NetXMS". Technical names ("NetXMS agent") are fine.
- Never name a customer in a tracked file.

## Deployment & theming

- `deploy/`: nginx host config and the snippets the console image shares; runbook
  `deploy/README.md`. `docker/`: Dockerfile (console image; `--target demo` = mock-data demo on
  `docker/demo-server.js`, which reuses `createMockHandler`). A new external origin (images,
  frames, fetches) needs a CSP entry in `deploy/nginx/snippets/web-ui-app.conf`.
- Theme = full 50-950 PrimeVue primary palette + `--app-header-*`, `--app-nav-*`,
  `--app-nav-active-*` + `headerTone`. Defined in `src/brands/netxms/themes.js`, served by
  `src/themes/index.js`.
- Status/severity colors (`--netxms-status-*`) are never part of a theme.
