---
worth: later
where: src/layouts/DefaultLayout.vue:173
added: 2026-11-03
---
# object views scroll sideways below about 1386 px

`.layout-main-inner` holds `min-width: 1000px` (added for the EPP section, 2026-05). With the rail and
the tree at their default widths, a view that is not full bleed starts scrolling sideways inside the
main pane below about 1386 px, so a 1366 px laptop is affected. At 1280 px the header's Actions menu
starts out of view, at about x=1386. It can still be reached by scrolling, which is why it was left
as it is for now. Lower the minimum per view, or keep the header's controls in view.
