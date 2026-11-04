---
worth: later
where: src/queries
added: 2026-11-04
---
# Simple invalidate-on-success mutations repeat the same shape

Many exported hooks in `src/queries/` are `useQueryClient` + `useMutation({ mutationFn, onSuccess: () => invalidateQueries(staticKey) })` (`grep -rn 'onSuccess: () => queryClient.invalidateQueries' src/queries`), e.g. `useAlarmCategoryQueries.js`, `useSshKeyQueries.js`, `useServerActionQueries.js`, `useSummaryTableQueries.js`. A `useInvalidatingMutation(mutationFn, queryKey)` helper would cut each to a few lines. Keep named domain hooks; return the invalidation promise.

Only for the identical simple cases. No CRUD factory: MappingTable/SnmpTrap seed detail caches from the save result, EventForwarder rename also invalidates serverActions, Incident cascades to alarms.

Open: whether the saving justifies one more indirection when reading a query file; do it only alongside other work in those files.

Joint codebase-size review with codex.
