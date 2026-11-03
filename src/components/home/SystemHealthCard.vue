<script setup>
import { computed } from 'vue'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import AppLink from '@/components/common/AppLink.vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import { useObjectsByClass } from '@/queries/useObjectQueries'
import { useServerInfo } from '@/queries/useServerQueries'
import { severityConfig, severityRank, stateConfig } from '@/utils/alarmDisplay'
import { getStatusInfo } from '@/utils/objectUtils'
import { alarmTarget, perspectiveTarget } from '@/utils/routeTargets'
import {
  NODE_STATUS_ORDER,
  countAlarmSeverities,
  countAlarmStates,
  summarizeNodes,
} from '@/utils/systemHealth'

const { data: alarms } = useAlarms()
// Not useObjects(): GET /v1/objects returns only perspective roots, never nodes.
const { data: nodes, isLoading: nodesLoading } = useObjectsByClass(['Node'])
const { data: serverInfoData } = useServerInfo()

const totalAlarms = computed(() => (alarms.value ?? []).length)

// Status palette CSS variables work anywhere a color does, including the conic-gradient.
const severityItems = computed(() => {
  const b = countAlarmSeverities(alarms.value)
  return [
    { key: 'critical', label: 'Critical', count: b.critical },
    { key: 'major', label: 'Major', count: b.major },
    { key: 'minor', label: 'Minor', count: b.minor },
    { key: 'warning', label: 'Warning', count: b.warning },
    { key: 'normal', label: 'Normal', count: b.normal },
  ].map((item) => {
    // Soft variant, like StatusTag: no single text color reads on every solid fill.
    const { bgColor, textColor } = getStatusInfo(severityRank(item.key))
    return { ...item, color: severityConfig[item.key].color, bgColor, textColor }
  })
})

const activeItems = computed(() => severityItems.value.filter((s) => s.count > 0))

const conicGradient = computed(() => {
  const items = activeItems.value
  const total = totalAlarms.value
  if (total === 0) return 'conic-gradient(var(--p-surface-border) 0deg 360deg)'

  const segments = []
  let current = 0
  for (const item of items) {
    const angle = (item.count / total) * 360
    segments.push(`${item.color} ${current}deg ${current + angle}deg`)
    current += angle
  }
  return `conic-gradient(${segments.join(', ')})`
})

const stateItems = computed(() => {
  const counts = countAlarmStates(alarms.value)
  return Object.entries(counts).map(([key, count]) => ({
    key,
    count,
    label: stateConfig[key].label,
    color: stateConfig[key].color,
  }))
})

const nodeSummary = computed(() => summarizeNodes(nodes.value))

// Worst status first so the red end of the bar lines up with the donut's start.
const nodeStatusItems = computed(() =>
  NODE_STATUS_ORDER.map((status) => ({
    status,
    count: nodeSummary.value.byStatus[status],
    ...getStatusInfo(status),
  })).filter((item) => item.count > 0),
)
</script>

<template>
  <Card class="health-card">
    <template #title>
      <div class="health-card-title">
        <i class="pi pi-heart health-card-icon" />
        System Health
      </div>
    </template>
    <template #content>
      <div class="health-layout">
        <div class="health-donut-wrap">
          <div class="health-donut" :style="{ background: conicGradient }">
            <div class="health-donut-center">
              <span class="health-donut-number">{{ totalAlarms }}</span>
              <span class="health-donut-label">alarms</span>
            </div>
          </div>
        </div>

        <div class="health-legend">
          <div v-for="item in severityItems" :key="item.label" class="health-legend-item">
            <span class="health-legend-dot" :style="{ background: item.color }" />
            <span class="health-legend-label">{{ item.label }}</span>
            <Tag
              :value="String(item.count)"
              :style="{
                background: item.count > 0 ? item.bgColor : 'var(--p-surface-border)',
                color: item.count > 0 ? item.textColor : 'var(--p-text-muted-color)',
              }"
              rounded
            />
          </div>
        </div>
      </div>

      <AppLink :to="alarmTarget()" class="health-states">
        <span v-for="item in stateItems" :key="item.key" class="health-state">
          <span class="health-legend-dot" :style="{ background: item.color }" />
          <span class="health-state-label">{{ item.label }}</span>
          <span class="health-state-count">{{ item.count }}</span>
        </span>
      </AppLink>

      <div class="health-nodes">
        <div class="health-nodes-header">
          <AppLink :to="perspectiveTarget('infrastructure')" class="health-nodes-total">
            <span class="health-nodes-number">{{ nodesLoading ? '--' : nodeSummary.total }}</span>
            {{ nodeSummary.total === 1 ? 'node' : 'nodes' }}
          </AppLink>
          <span v-if="nodeSummary.maintenance > 0" class="health-nodes-maintenance">
            <i class="pi pi-wrench" />
            {{ nodeSummary.maintenance }} in maintenance
          </span>
        </div>

        <div class="health-nodes-bar">
          <span
            v-for="item in nodeStatusItems"
            :key="item.status"
            class="health-nodes-segment"
            :style="{ flexGrow: item.count, background: item.color }"
            :title="`${item.label}: ${item.count}`"
          />
        </div>

        <div v-if="nodeStatusItems.length" class="health-nodes-legend">
          <span v-for="item in nodeStatusItems" :key="item.status" class="health-state">
            <span class="health-legend-dot" :style="{ background: item.color }" />
            <span class="health-state-label">{{ item.label }}</span>
            <span class="health-state-count">{{ item.count }}</span>
          </span>
        </div>
        <span v-else-if="!nodesLoading" class="health-nodes-empty">No nodes</span>
      </div>

      <div class="health-metrics">
        <div class="health-metric">
          <span class="health-metric-value" :title="serverInfoData?.name">
            {{ serverInfoData?.name || '--' }}
          </span>
          <span class="health-metric-label">Server</span>
        </div>
        <div class="health-metric-divider" />
        <div class="health-metric">
          <span class="health-metric-value">
            {{ serverInfoData?.version || '--' }}
          </span>
          <span class="health-metric-label">Version</span>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
/* Fill the grid cell so the footer row can sit on the card's bottom edge. */
.health-card {
  height: 100%;
}

.health-card :deep(.p-card-body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.health-card :deep(.p-card-content) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.health-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
}

.health-card-icon {
  color: var(--p-primary-color);
}

.health-layout {
  display: flex;
  align-items: center;
  gap: 2rem;
  margin-bottom: 1rem;
}

.health-donut-wrap {
  flex-shrink: 0;
}

.health-donut {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.health-donut-center {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: var(--p-surface-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.health-donut-number {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--p-text-color);
  line-height: 1;
}

.health-donut-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-top: 0.125rem;
}

.health-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.health-legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.health-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.health-legend-label {
  flex: 1;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.health-states,
.health-nodes-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1.25rem;
}

.health-states {
  justify-content: center;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius-md);
  background: var(--p-surface-ground);
}

.health-states:hover {
  background: var(--p-surface-hover);
}

.health-state {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.health-state-label {
  color: var(--p-text-muted-color);
}

.health-state-count {
  font-weight: 600;
  color: var(--p-text-color);
}

.health-nodes {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-block: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-surface-border);
}

.health-nodes-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.health-nodes-total {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.health-nodes-total:hover .health-nodes-number {
  color: var(--p-primary-color);
}

.health-nodes-number {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--p-text-color);
  margin-right: 0.25rem;
}

.health-nodes-maintenance {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.health-nodes-bar {
  display: flex;
  gap: 2px;
  height: 0.625rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--p-surface-border);
}

.health-nodes-segment {
  flex-basis: 0;
  min-width: 4px;
}

.health-nodes-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.health-metrics {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 1rem 0 0;
  border-top: 1px solid var(--p-surface-border);
}

.health-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: 0.125rem;
}

.health-metric-value {
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--p-text-color);
}

.health-metric-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.health-metric-divider {
  width: 1px;
  height: 2rem;
  background: var(--p-surface-border);
}

@media (max-width: 500px) {
  .health-layout {
    flex-direction: column;
  }
}
</style>
