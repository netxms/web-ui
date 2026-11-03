# Project profile: NetXMS web console

## What it is
- Vue 3 SPA (JavaScript + JSDoc), web console for the NetXMS monitoring server. WebAPI only, via
  `src/api/`. Static files behind nginx (`deploy/`, `docker/`).
- 0.9.x, small team, heading for a first public open-source release.
- Users: NOC operators and administrators. Real installs have tens of thousands of objects and alarms.

## What a real failure looks like
- Action hits the wrong objects: one instead of the multi-selection, a stale selection, more or fewer
  than picked (delete/terminate/move).
- Wrong state shown: alarm state/severity, object status, DCI values stale, from another object, or
  silently missing.
- Lost work: dashboard/network map save dropping fields the legacy Java client wrote (unknown fields
  must round-trip); dialog saving partially and reporting success; batch write assuming every parallel
  request succeeded.
- Flow never completes: unresolved promise (dismissed confirm, cancelled dialog), endless spinner,
  reconnect that never starts.
- Cross-session/user leaks: module-level singletons surviving logout; per-user prefs under the wrong
  user.
- Server load: unbounded request fan-out (per object on a map or tree), polling never torn down,
  refetch loops.
- Unsanitized HTML from object names, comments, alarm messages, NXSL output (DOMPurify/marked are the
  sanctioned paths); anything weakening the CSP in `deploy/nginx/snippets/netxms-console-app.conf`.
- Build boundaries: enterprise module code (`src/modules/<id>/`) or a non-default brand in the default
  bundle; demo content (`VITE_DEMO_CONTENT`, mocks) in a release build.
- A customer name, internal hostname or private repository in a tracked file.

## Blast radius
- Every operator of every server running this console. A wrong bulk action or stale alarm view can
  derail a real outage response; a layout glitch cannot.
- Shared code fails everywhere at once: `AppTable`, `SmartFilterInput`, `src/api/client.js`,
  `src/queries/config.js`, the action registry, `src/utils/appStorage.js`, module and brand registries.

## Reporting bar
- Report what an operator/administrator would hit, or what makes a later change wrong. True but
  immaterial is noise.
- Legacy Java client parity is the behavior reference: a divergence matters when it loses data or
  capability, not when layout was deliberately redesigned.
- Check WebAPI usage against `src/server/webapi/openapi.yaml` (github.com/netxms/netxms).
- Noise, never report:
  - formatting and lint-level style (oxfmt, oxlint/ESLint own it)
  - "add TypeScript", "add comments", taste refactors
  - defensive checks for states no caller can reach
  - missing tests for layout/styling (no e2e or snapshot suite exists by design)
  - `AppTable` instead of PrimeVue DataTable
  - missing modifier-key handling on navigation: `useNavTarget().navBindings` covers it, inline
    handling is the defect

## Where the rules live
- `CLAUDE.md` (conventions, architecture, module/brand/deploy rules), `README.md`,
  `deploy/README.md`, `docker/README.md`, `eslint.config.js` (import boundaries). A deviation from a `CLAUDE.md` rule is
  always worth reporting.
- `docs/backlog/`: known deferred items. Don't re-report one; say when a change makes one worse.
