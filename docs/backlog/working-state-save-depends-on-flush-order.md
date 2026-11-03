---
worth: yes
where: src/composables/useWorkingState.js:97
added: 2026-11-03
---
# working-state save depends on unmount vs post-flush order

The post-flush watcher files the save under the right object only because post flush runs after any unmount in the same flush. Make the save and reset order explicit, e.g. one handler for both.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
