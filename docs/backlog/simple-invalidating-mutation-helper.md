---
worth: later
where: src/queries/useAlarmCategoryQueries.js:18
added: 2026-11-04
---
# Simple invalidate-on-success mutations repeat the same shape

About 70 exported hooks in `src/queries/` (495 lines) are `useQueryClient` + `useMutation({ mutationFn, onSuccess: () => invalidateQueries(staticKey) })`, e.g. `useAlarmCategoryQueries.js`, `useSshKeyQueries.js`, `useServerActionQueries.js`, `useSummaryTableQueries.js`. A `useInvalidatingMutation(mutationFn, queryKey)` helper would cut each to 3–4 lines, ~200–270 net. Keep named domain hooks; return the invalidation promise.

Only for the identical simple cases. No CRUD factory: MappingTable/SnmpTrap seed detail caches from the save result, EventForwarder rename also invalidates serverActions, Incident cascades to alarms.

Open: whether ~250 lines justify one more indirection when reading a query file; do it only alongside other work in those files.

Joint codebase-size review with codex.
