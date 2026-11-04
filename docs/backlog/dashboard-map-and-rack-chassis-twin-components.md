---
worth: later
added: 2026-11-04
---
# Dashboard/network-map and rack/chassis twin components

Near-copies that differ in names, icons and labels:

- `dashboards/DashboardGroupDetailView.vue` vs `network-maps/NetworkMapGroupDetailView.vue` and the two `*RootDetailView.vue`: 161/165 lines, 0.94 similar. `*GroupStatusView` / `*RootStatusView` 0.76–0.79; `DashboardContentsTable.vue` vs `MapContentsTable.vue` 0.80. ~450 lines.
- `rack/RackElementPanel.vue` vs `chassis/ChassisElementPanel.vue` 0.89 (298/292); `AddRackElementDialog` vs `AddChassisElementDialog` 0.57; `RackView.vue` vs `ChassisView.vue` share ~460 lines. The canvases differ (0.27) and stay separate. ~500–700 lines.
- `TemplatesView` / `BusinessServicesView` / `AssetsView` (630/527/485) share ~400 lines pairwise: sidebar tree, filter, create menu, context menu, deletion navigation, tab bar. ~800–1,000 lines with one perspective shell. `ObjectsView` overlaps little; leave it.

Open: whether these pairs will keep evolving together. If the legacy client keeps them identical, parametrize by kind; if they are about to diverge (e.g. dashboard-only group actions), merging now just adds flags. Check against the legacy views before starting.

Joint codebase-size review with codex.
