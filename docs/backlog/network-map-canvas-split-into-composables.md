---
worth: later
where: src/components/network-maps/NetworkMapCanvas.vue
added: 2026-11-03
---
# NetworkMapCanvas.vue is too large to follow

About 3,100 lines in one component. Candidates to move into composables: the overflow tables, backdrop/geo pick, bend-point editing. Open: whether the split pays for itself while the map editor is still changing quickly.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
