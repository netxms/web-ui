---
worth: yes
where: src/stores/onboardingStore.js:52
added: 2026-11-03
---
# onboarding hydrate relies on a lastPersisted guard

The `lastPersisted` serialization guard exists to stop the deep watcher writing state back right after hydrate. An explicit hydrate path that bypasses the watcher would remove the guard.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
