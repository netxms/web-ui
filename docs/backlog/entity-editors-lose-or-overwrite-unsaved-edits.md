---
worth: yes
where: src/composables/usePropertyEditor.js:72
added: 2026-11-04
---
# Entity detail editors lose or overwrite unsaved edits inconsistently

The 16 `*DetailView.vue` form editors repeat variants of draft initialization, dirty tracking, reset/save/discard and the Discard+Save header (most via `buildForm` + `JSON.stringify`; MappingTable/SnmpTrap use `load()` + a baseline with separately tracked entries; EPP and user editors have their own draft contracts). Behavior has drifted:

- Only MappingTable and SnmpTrapMapping use `useUnsavedChangesGuard` (with `includeRouteUpdates`). WebService confirms local back/selection (`WebServiceDetailView.vue` `tryClose`, `WebServiceDefinitionsSection.vue` `tryNavigate`) but has no route-leave guard. EppSection guards chain drafts, not the open rule form. The rest have no guard.
- `SummaryTableDetailView.vue:47` and `EventTemplateDetailView.vue:56` reset the draft whenever the prop changes. EventTemplate's query is MODERATE (refetch on focus), so changed server data arriving mid-edit overwrites the draft. MappingTable/SnmpTrap reset only when `!isDirty`.

`usePropertyEditor` already has draft/dirty/save/guard, but none of these editors use it, and it is not a drop-in: it calls `useUnsavedChangesGuard(isDirty)` without `includeRouteUpdates` (list/detail sections stay on one route record, so detail-to-detail and back-to-list are unguarded), and it assumes `id` identity (event templates key by code, some domains by name).

Fix: one editor contract on top of `usePropertyEditor` with an identity accessor, `buildForm`/serialize hooks, `includeRouteUpdates`, a local-close confirm for state-driven back buttons, keep dirty drafts on same-entity refresh, rebaseline after a successful save. Migrate the simple editors and leave EPP/user editors on their own contracts; also removes ~60–100 lines per editor (Discard/Save buttons in 22 files, `.detail-cards-grid` defined 17× in 4 variants, `.detail-content` 15× in 3).

Tests to add with it: dirty refresh, same-record navigation, local close, cancelled navigation leaves the draft intact, save failure leaves it dirty, create vs update, rebaseline from the canonical server response after save. These matter more than the line savings.

Joint codebase-size review with codex.
