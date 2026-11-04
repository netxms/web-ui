---
worth: yes
where: src/components/network-maps/NetworkMapCanvas.vue
added: 2026-11-03
---
# demo zone/image drag and resize duplicate the base element code

The demo-only zone and image-region drag/resize code repeats the base element drag/resize, and its `isExtraZone` branches are hard to follow. Drop the demo paths, or move them onto `baseGeom` / `onBaseResize*`.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
