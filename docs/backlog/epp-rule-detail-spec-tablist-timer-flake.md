---
worth: yes
where: src/components/epp/__tests__/EppRuleDetailView.spec.js
added: 2026-10-29
---
# EppRuleDetailView spec flakes on a PrimeVue TabList timer

A full `yarn test:unit --run` occasionally exits 1 with every test passing: an unhandled
`ReferenceError: HTMLElement is not defined` from `primevue/tablist` `updateInkBar`, scheduled by
a `setTimeout` in TabList and fired after the spec's jsdom environment was torn down. Seen once in
two runs on 2026-10-29; the re-run was clean. The spec mounts `EppRuleDetailView.vue`, whose
`Tabs`/`TabList` (line 1112) start that timer. Unmounting the wrapper, or running fake timers
through to the end, before the test finishes should stop it.
