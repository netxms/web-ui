/**
 * Maps dashboard element type keys to async widget components and config editors; type
 * metadata lives in src/utils/dashboardElements.js. A type without a widget renders a
 * placeholder; one without an editor gets the raw-JSON editor.
 */
import { defineAsyncComponent } from 'vue'
import { ELEMENT_TYPE_BY_KEY } from '@/utils/dashboardElements'

export const WIDGET_COMPONENTS = {
  label: defineAsyncComponent(() => import('./widgets/LabelWidget.vue')),
  'line-chart': defineAsyncComponent(() => import('./widgets/LineChartWidget.vue')),
  'bar-chart': defineAsyncComponent(() => import('./widgets/BarChartWidget.vue')),
  'tube-chart': defineAsyncComponent(() => import('./widgets/BarChartWidget.vue')),
  'pie-chart': defineAsyncComponent(() => import('./widgets/PieChartWidget.vue')),
  'gauge-chart': defineAsyncComponent(() => import('./widgets/GaugeChartWidget.vue')),
  // The scripted gauge is the DCI gauge with a script source; useGaugeItems picks it by type key.
  'scripted-gauge': defineAsyncComponent(() => import('./widgets/GaugeChartWidget.vue')),
  'status-chart': defineAsyncComponent(() => import('./widgets/StatusChartWidget.vue')),
  'availability-chart': defineAsyncComponent(() => import('./widgets/AvailabilityChartWidget.vue')),
  'status-indicator': defineAsyncComponent(() => import('./widgets/StatusIndicatorWidget.vue')),
  'status-map': defineAsyncComponent(() => import('./widgets/StatusMapWidget.vue')),
  'network-map': defineAsyncComponent(() => import('./widgets/NetworkMapWidget.vue')),
  'alarm-viewer': defineAsyncComponent(() => import('./widgets/AlarmViewerWidget.vue')),
  'scripted-bar-chart': defineAsyncComponent(() => import('./widgets/ScriptedChartWidget.vue')),
  'scripted-pie-chart': defineAsyncComponent(() => import('./widgets/ScriptedChartWidget.vue')),
  separator: defineAsyncComponent(() => import('./widgets/SeparatorWidget.vue')),
  'web-page': defineAsyncComponent(() => import('./widgets/WebPageWidget.vue')),
  'embedded-dashboard': defineAsyncComponent(() => import('./widgets/EmbeddedDashboardWidget.vue')),
  'geo-map': defineAsyncComponent(() => import('./widgets/GeoMapWidget.vue')),
  'dci-summary-table': defineAsyncComponent(() => import('./widgets/DciSummaryTableWidget.vue')),
  'table-value': defineAsyncComponent(() => import('./widgets/TableValueWidget.vue')),
  // Table-DCI comparison charts share their DCI-list counterparts' components; useChartItems picks
  // the source by type key.
  'table-bar-chart': defineAsyncComponent(() => import('./widgets/BarChartWidget.vue')),
  'table-tube-chart': defineAsyncComponent(() => import('./widgets/BarChartWidget.vue')),
  'table-pie-chart': defineAsyncComponent(() => import('./widgets/PieChartWidget.vue')),
  'object-query': defineAsyncComponent(() => import('./widgets/ObjectQueryWidget.vue')),
  'rack-diagram': defineAsyncComponent(() => import('./widgets/RackDiagramWidget.vue')),
  'port-view': defineAsyncComponent(() => import('./widgets/PortViewWidget.vue')),
  'service-components': defineAsyncComponent(() => import('./widgets/ServiceComponentsWidget.vue')),
  'object-tools': defineAsyncComponent(() => import('./widgets/ObjectToolsWidget.vue')),
  // One component for all trace widgets; it picks its log by type key.
  'syslog-monitor': defineAsyncComponent(() => import('./widgets/LogMonitorWidget.vue')),
  'snmp-trap-monitor': defineAsyncComponent(() => import('./widgets/LogMonitorWidget.vue')),
  'event-monitor': defineAsyncComponent(() => import('./widgets/LogMonitorWidget.vue')),
  'ai-observation-monitor': defineAsyncComponent(
    () => import('./widgets/AiObservationMonitorWidget.vue'),
  ),
}

/** Shown in the General tab of WidgetPropertiesDialog. */
export const CONFIG_EDITORS = {
  label: defineAsyncComponent(() => import('./widgets/config/LabelConfig.vue')),
  'line-chart': defineAsyncComponent(() => import('./widgets/config/LineChartConfig.vue')),
  'bar-chart': defineAsyncComponent(() => import('./widgets/config/BarChartConfig.vue')),
  'tube-chart': defineAsyncComponent(() => import('./widgets/config/BarChartConfig.vue')),
  'pie-chart': defineAsyncComponent(() => import('./widgets/config/PieChartConfig.vue')),
  'gauge-chart': defineAsyncComponent(() => import('./widgets/config/GaugeChartConfig.vue')),
  'scripted-gauge': defineAsyncComponent(() => import('./widgets/config/ScriptedGaugeConfig.vue')),
  'status-chart': defineAsyncComponent(() => import('./widgets/config/StatusChartConfig.vue')),
  'availability-chart': defineAsyncComponent(
    () => import('./widgets/config/AvailabilityChartConfig.vue'),
  ),
  'status-indicator': defineAsyncComponent(
    () => import('./widgets/config/StatusIndicatorConfig.vue'),
  ),
  'status-map': defineAsyncComponent(() => import('./widgets/config/StatusMapConfig.vue')),
  'network-map': defineAsyncComponent(() => import('./widgets/config/NetworkMapConfig.vue')),
  'alarm-viewer': defineAsyncComponent(() => import('./widgets/config/AlarmViewerConfig.vue')),
  'scripted-bar-chart': defineAsyncComponent(
    () => import('./widgets/config/ScriptedChartConfig.vue'),
  ),
  'scripted-pie-chart': defineAsyncComponent(
    () => import('./widgets/config/ScriptedChartConfig.vue'),
  ),
  separator: defineAsyncComponent(() => import('./widgets/config/SeparatorConfig.vue')),
  'web-page': defineAsyncComponent(() => import('./widgets/config/WebPageConfig.vue')),
  'embedded-dashboard': defineAsyncComponent(
    () => import('./widgets/config/EmbeddedDashboardConfig.vue'),
  ),
  'geo-map': defineAsyncComponent(() => import('./widgets/config/GeoMapConfig.vue')),
  'dci-summary-table': defineAsyncComponent(
    () => import('./widgets/config/DciSummaryTableConfig.vue'),
  ),
  'table-value': defineAsyncComponent(() => import('./widgets/config/TableValueConfig.vue')),
  'table-bar-chart': defineAsyncComponent(() => import('./widgets/config/TableChartConfig.vue')),
  'table-tube-chart': defineAsyncComponent(() => import('./widgets/config/TableChartConfig.vue')),
  'table-pie-chart': defineAsyncComponent(() => import('./widgets/config/TableChartConfig.vue')),
  'object-query': defineAsyncComponent(() => import('./widgets/config/ObjectQueryConfig.vue')),
  'rack-diagram': defineAsyncComponent(() => import('./widgets/config/RackDiagramConfig.vue')),
  'port-view': defineAsyncComponent(() => import('./widgets/config/PortViewConfig.vue')),
  'service-components': defineAsyncComponent(
    () => import('./widgets/config/ServiceComponentsConfig.vue'),
  ),
  'object-tools': defineAsyncComponent(() => import('./widgets/config/ObjectToolsConfig.vue')),
  'syslog-monitor': defineAsyncComponent(() => import('./widgets/config/LogMonitorConfig.vue')),
  'snmp-trap-monitor': defineAsyncComponent(() => import('./widgets/config/LogMonitorConfig.vue')),
  'event-monitor': defineAsyncComponent(() => import('./widgets/config/EventMonitorConfig.vue')),
  'ai-observation-monitor': defineAsyncComponent(
    () => import('./widgets/config/AiObservationMonitorConfig.vue'),
  ),
}

/** Implemented widgets only, as [{ group, types: [{ key, label, icon }] }]. */
export function getAddableTypeGroups() {
  const groups = new Map()
  for (const key of Object.keys(WIDGET_COMPONENTS)) {
    const def = ELEMENT_TYPE_BY_KEY[key]
    if (!def) continue
    if (!groups.has(def.group)) groups.set(def.group, [])
    groups.get(def.group).push({ key, label: def.label, icon: def.icon })
  }
  const order = ['Charts', 'Status', 'Tables', 'Monitors', 'Maps', 'Layout', 'Other']
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([group, types]) => ({ group, types }))
}
