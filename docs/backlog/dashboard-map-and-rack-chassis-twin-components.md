---
worth: later
added: 2026-11-04
---
# Dashboard/network-map and rack/chassis twin components

Near-copies that differ in names, icons and labels:

- `dashboards/DashboardGroupDetailView.vue` vs `network-maps/NetworkMapGroupDetailView.vue` and the two `*RootDetailView.vue`: near-identical. `*GroupStatusView` / `*RootStatusView` and `DashboardContentsTable.vue` vs `MapContentsTable.vue`: mostly shared.
- `rack/RackElementPanel.vue` vs `chassis/ChassisElementPanel.vue`: near-identical. `AddRackElementDialog` vs `AddChassisElementDialog` and `RackView.vue` vs `ChassisView.vue`: largely shared. The canvases differ and stay separate.
- `TemplatesView` / `BusinessServicesView` / `AssetsView` share most of their structure pairwise: sidebar tree, filter, create menu, context menu, deletion navigation, tab bar. One perspective shell would carry it. `ObjectsView` overlaps little; leave it.

Open: whether these pairs will keep evolving together. If the legacy client keeps them identical, parametrize by kind; if they are about to diverge (e.g. dashboard-only group actions), merging now just adds flags. Check against the legacy views before starting.

Joint codebase-size review with codex.
