---
worth: yes
where: src/utils/networkMapUtils.js:656
added: 2026-11-04
---
# Unused exports in networkMapUtils and a few API wrappers

These have no product callers; the map helpers below are exercised only by tests.

- `networkMapUtils.js`: `elementsToNodes` (:656), `elementsToLayouts`, `linksToEdges`, `getLinkLabel` (:388), `linkLabelPoint`, `getNodeStatusColors` (:789). ~90 lines with JSDoc, plus tests that maintain unused behavior. One dangling-link test asserts through `linksToEdges`; move that assertion to the live path, do not lose it.
- Query hooks: `useLinkIncidentAlarm` / `useUnlinkIncidentAlarm` (`useIncidentQueries.js`), `useWebServiceDefinition`.
- 3-line API getters: `aiApi.deleteAiChat`, `geographicalAreasApi.getArea`, `notificationChannelsApi.getNotificationChannel`, `objectCategoriesApi.getObjectCategory`, `sshKeysApi.getSshKey`, `twoFactorApi.getTwoFactorMethod`. Cheap to keep if a screen will need them soon; delete otherwise.

Keep helpers that remain internally live even if only tests import their export. Also keep deliberate test hooks such as `resetDemoDashboardCache`.

Joint codebase-size review with codex.
