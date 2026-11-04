---
worth: yes
added: 2026-11-04
---
# mb-2 / mb-3 / mb-4 classes are used but not defined

82 class attributes in 26 `.vue` files use `mb-2` (66), `mb-3` (14) or `mb-4` (2), mostly on PrimeVue `Skeleton` in loading states. No global stylesheet defines them: `ViewContainer.vue` defines `.mb-2` and `.mb-4` scoped to itself, and `.mb-3` is defined nowhere. Outside ViewContainer the classes add no margin; where the parent has no gap either, skeleton rows touch (e.g. `ActionsSection.vue` `.detail-loading`, padding only).

Fix together with the loading states: use `TableSkeleton` / `LoadingState` (today `TableSkeleton` is used in 2 files vs 42 hand-rolled `<Skeleton v-for>`), or define the spacing where it is used. Do not add a utility-class framework for this.

Joint codebase-size review with codex.
