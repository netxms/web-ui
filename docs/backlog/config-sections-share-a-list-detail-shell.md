---
worth: yes
where: src/views/configuration/sections/ActionsSection.vue
added: 2026-11-04
---
# Config list sections copy the same list/detail shell

About 20 sections in `src/views/configuration/sections/` (250–550 lines each) repeat: SectionHeader with Refresh + Add, toolbar with SmartFilterInput and item count, a Skeleton loop, AppTable wiring, Edit/Delete context menu, `confirm.require` + success/error toasts on delete, a detail branch with Loading / Error / Not Found states, and ~80 lines of the same scoped CSS. ActionsSection vs EventForwardersSection and ChatBotsSection vs ActionsSection are ~0.65 similar by difflib; `.section-toolbar` is defined 19× (17 identical), `class="item-count"` in 25 files, `title="Not Found"` in 10, `class="detail-loading"` in 12.

Fix: an entity list/detail section component (slots for cells and detail) plus a delete-with-confirm helper. Pilot on Actions + EventForwarders, then migrate the simple sections; keep EPP, UsersGroups, ServerConfig and other non-list screens custom. Estimate −2.5k to −3.5k lines once migrated, CSS included. Pairs with `entity-editors-lose-or-overwrite-unsaved-edits.md`, which owns the detail editor half.

Joint codebase-size review with codex.
