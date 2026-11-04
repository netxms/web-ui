# Remove unused exports in networkMapUtils, queries and API

Implements `docs/backlog/network-map-utils-unused-exports.md`. Pure deletion: no behavior change.

## Tandem

| Task | Writer | Reviewer |
|---|---|---|
| 1 | claude | codex |
| 2 | codex | claude |
| 3 | claude | codex |

## Context

A joint review found exports with no product caller (checked with `grep -rnw` over `src/`, `mocks/`,
`e2e/`, including the untracked `src/modules/atm` checkout). Deleting one can leave a function it
called without callers; those go too, in the same task. Keep internally live helpers even when only
tests import them, and deliberate test hooks such as `resetDemoDashboardCache`.

## Validation

`yarn test:unit`, `yarn lint:ci`, `yarn build` after each task.

### Task 1: Drop the obsolete network map helpers

`src/utils/networkMapUtils.js`, `src/utils/__tests__/networkMapUtils.spec.js`

- [x] Remove `getLinkLabel`, `linkLabelPoint`, `elementsToNodes`, `elementsToLayouts`, `linksToEdges`, `getNodeStatusColors` and their JSDoc. Keep `linkLabelFraction` (used by `networkMapLinkLabels.js`) and the `getStatusHexColor` import (still used in the file).
- [x] Remove their `describe` blocks and imports from the spec.
- [x] The dangling-link adapter test ends with `expect(linksToEdges(result.links)).toEqual({})`; drop that line and keep the adapter assertions (link kept, `to` null). The live skip is inline in `NetworkMapCanvas.vue` (`mapData.links.filter((link) => link.from && link.to)`); do not extract it for this.
- ➕ `linkLabelFraction` keeps its own spec, so dropping the `linkLabelPoint` cases loses no coverage of live code.

### Task 2: Drop unused query hooks and API getters, close the backlog item

- [x] `src/queries/useIncidentQueries.js`: `useLinkIncidentAlarm`, `useUnlinkIncidentAlarm`; then `linkAlarm`, `unlinkAlarm` in `src/api/incidentsApi.js` if nothing else calls them.
- [x] `src/queries/useWebServiceQueries.js`: `useWebServiceDefinition`; then `getWebServiceDefinition` in `src/api/webServicesApi.js` if nothing else calls it. Remove the orphan detail cache key and invalidation; update invalidates `webServiceKeys.all()`.
- [x] API getters: `aiApi.deleteAiChat`, `geographicalAreasApi.getArea`, `notificationChannelsApi.getNotificationChannel`, `objectCategoriesApi.getObjectCategory`, `sshKeysApi.getSshKey`, `twoFactorApi.getTwoFactorMethod`.
- [x] Remove any test or mock handler that exists only for a removed function. None found; shared list fixtures remain.
- [x] `git rm docs/backlog/network-map-utils-unused-exports.md` in this commit.
- ➕ Review confirmed the removed detail query was the only consumer of its cache key. The update mutation keeps its existing non-awaited invalidation behavior.

### Task 3: Close the plan

- [x] Move this file to `docs/plans/completed/`.
