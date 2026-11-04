---
worth: yes
added: 2026-11-04
---
# mb-2 / mb-3 / mb-4 classes are used but not defined

`.vue` files use `mb-2`, `mb-3` and `mb-4` in class attributes, mostly on PrimeVue `Skeleton` in loading states (`grep -rE 'class="[^"]*\bmb-[234]\b' src`). No global stylesheet defines them: `ViewContainer.vue` defines `.mb-2` and `.mb-4` scoped to itself, and `.mb-3` is defined nowhere. Outside ViewContainer the classes add no margin; where the parent has no gap either, skeleton rows touch.

Fix together with the loading states: use `TableSkeleton` / `LoadingState` instead of hand-rolled `<Skeleton v-for>` loops, or define the spacing where it is used. Do not add a utility-class framework for this.

Joint codebase-size review with codex.
