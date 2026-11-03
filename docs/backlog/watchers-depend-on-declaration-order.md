---
worth: yes
where: src/views/network-maps/NetworkMapsView.vue:86
added: 2026-11-03
---
# view watchers depend on declaration order

`NetworkMapsView.vue`: `editor` is declared early for watchers above it, and a `watch` sits after `mapPropertiesOpen` because `immediate` evaluates its source at declaration. `ObjectsView.vue`: the `?create=` watcher has to sit below `rootTreeObject`. Moving a block breaks them. Splitting editor and properties-panel state into composables would remove the ordering constraint.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
