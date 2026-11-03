<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQueries } from '@tanstack/vue-query'
import Skeleton from 'primevue/skeleton'
import Button from 'primevue/button'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppLink from '@/components/common/AppLink.vue'
import PerfDciChart from '@/components/objects/PerfDciChart.vue'
import { usePerformanceDcis, objectKeys } from '@/queries/useObjectQueries'
import { useDciConfigList } from '@/queries/useDciConfigQueries'
import { getDciHistory } from '@/api/objectsApi'
import { MODERATE_TIER } from '@/queries/config'
import { objectTarget } from '@/utils/routeTargets'
import { resolveHref, isPlainLeftClick } from '@/utils/navigation'
import { createChartModel, serializeToQuery, CHART_TIME_PRESETS } from '@/utils/dciChartModel'

const DCI_TARGET_CLASSES = new Set([
  'Node',
  'Cluster',
  'MobileDevice',
  'AccessPoint',
  'Chassis',
  'Sensor',
  'Collector',
  'Circuit',
])

const props = defineProps({
  object: { type: Object, required: true },
})

const isDciTarget = computed(() => DCI_TARGET_CLASSES.has(props.object.class))
const objectId = computed(() => props.object.id)

const {
  data: perfData,
  isLoading: loadingConfig,
  isFetching: fetchingConfig,
} = usePerformanceDcis(objectId, { enabled: isDciTarget })

const dcis = computed(() => (perfData.value?.dcis ?? []).filter((d) => d.chartConfig.enabled))

function computePerfTimeRange(timeRange, timeUnits) {
  const now = Math.floor(Date.now() / 1000)
  const multipliers = { 0: 60, 1: 3600, 2: 86400 }
  const seconds = (timeRange ?? 24) * (multipliers[timeUnits ?? 1] ?? 3600)
  return { timeFrom: now - seconds, timeTo: now }
}

const historyQueries = useQueries({
  queries: computed(() =>
    dcis.value.map((dci) => {
      const { timeFrom, timeTo } = computePerfTimeRange(
        dci.chartConfig.timeRange,
        dci.chartConfig.timeUnits,
      )
      return {
        queryKey: [...objectKeys.dciHistory(objectId.value, dci.id), timeFrom, timeTo],
        queryFn: () => getDciHistory(objectId.value, dci.id, { timeFrom, timeTo, maxRows: 500 }),
        enabled: isDciTarget.value && !!perfData.value,
        ...MODERATE_TIER,
      }
    }),
  ),
})

const historyByDciId = computed(() => {
  const map = new Map()
  dcis.value.forEach((dci, i) => {
    map.set(dci.id, historyQueries.value[i])
  })
  return map
})

const anyHistoryFetching = computed(() => historyQueries.value.some((q) => q.isFetching))

function buildChartSlots(dciList) {
  const groups = new Map()
  const individuals = []

  for (const dci of dciList) {
    const cfg = dci.chartConfig
    if (cfg.groupName) {
      if (!groups.has(cfg.groupName)) groups.set(cfg.groupName, [])
      groups.get(cfg.groupName).push(dci)
    } else {
      individuals.push(dci)
    }
  }

  const slots = []

  for (const [groupName, groupDcis] of groups) {
    const sorted = [...groupDcis].sort((a, b) => a.chartConfig.order - b.chartConfig.order)
    const firstCfg = sorted[0].chartConfig
    slots.push({
      id: `group:${groupName}`,
      title: firstCfg.title || groupName,
      dcis: sorted,
      chartConfig: firstCfg,
      order: Math.min(...groupDcis.map((d) => d.chartConfig.order)),
    })
  }

  for (const dci of individuals) {
    const cfg = dci.chartConfig
    slots.push({
      id: `dci:${dci.id}`,
      title: cfg.title || dci.description || dci.name,
      dcis: [dci],
      chartConfig: cfg,
      order: cfg.order,
    })
  }

  slots.sort((a, b) => a.order - b.order)
  return slots
}

const chartGroups = computed(() => buildChartSlots(dcis.value))

const MAX_ELIGIBLE_SHOWN = 6

// Fetched only once the perf config resolves empty, to offer collected metrics not shown here.
const isEmpty = computed(() => !loadingConfig.value && chartGroups.value.length === 0)
const eligibleQueryEnabled = computed(() => isDciTarget.value && isEmpty.value)

const { data: dciConfigList } = useDciConfigList(objectId, { enabled: eligibleQueryEnabled })

// Single items with a numeric data type only.
const eligibleDcis = computed(() =>
  (dciConfigList.value ?? []).filter(
    (d) => (d.type ?? 'item') === 'item' && d.dataType !== 'string',
  ),
)
const eligibleShown = computed(() => eligibleDcis.value.slice(0, MAX_ELIGIBLE_SHOWN))

/** Opens the DCI's editor on the Performance View tab. */
function dciPerfTarget(dciId) {
  return objectTarget(props.object, 'dcis', {
    entityId: dciId,
    query: { tab: 'performance' },
  })
}

/** Opens a new DCI on the Performance View tab. */
const newDciTarget = computed(() =>
  objectTarget(props.object, 'dcis', { entityId: 'new', query: { tab: 'performance' } }),
)

const dataCollectionTarget = computed(() => objectTarget(props.object, 'dcis'))

const router = useRouter()

/**
 * Reopens one card's DCIs in the full chart view with the card's own time window and
 * area/log settings.
 */
function chartTargetFor(chart) {
  const cfg = chart.chartConfig ?? {}
  const model = createChartModel({
    dcis: chart.dcis.map((dci) => ({
      nodeId: objectId.value,
      dciId: dci.id,
      label: dci.chartConfig?.name || dci.description || dci.name,
    })),
    time: { preset: perfPresetFor(cfg) },
    render: {
      area: chart.dcis.some((dci) => dci.chartConfig?.type === 1),
      stacked: cfg.stacked === true,
      log: cfg.logScaleEnabled === true,
    },
    yAxis:
      cfg.autoScale === false
        ? { auto: false, min: cfg.minYScaleValue ?? null, max: cfg.maxYScaleValue ?? null }
        : {},
  })
  return objectTarget(props.object, 'chart', {
    query: serializeToQuery(model, objectId.value),
  })
}

/** The card stores a free-form value+unit, so the nearest preset stands in. */
function perfPresetFor(cfg) {
  const multipliers = { 0: 60, 1: 3600, 2: 86400 }
  const seconds = (cfg.timeRange ?? 24) * (multipliers[cfg.timeUnits ?? 1] ?? 3600)
  return CHART_TIME_PRESETS.filter((p) => p.seconds).reduce((best, p) =>
    Math.abs(p.seconds - seconds) < Math.abs(best.seconds - seconds) ? p : best,
  ).id
}

// Anchors navigate natively on ctrl/cmd/middle click; a plain click runs an SPA push.
function navClick(event, target) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  router.push(target)
}

const chartsWithData = computed(() =>
  chartGroups.value.map((slot) => ({
    ...slot,
    isLoading: slot.dcis.some((dci) => historyByDciId.value.get(dci.id)?.isLoading),
    series: slot.dcis.map((dci) => {
      const query = historyByDciId.value.get(dci.id)
      const cfg = dci.chartConfig
      return {
        name: cfg.name || dci.description || dci.name,
        color: cfg.color,
        automaticColor: cfg.automaticColor,
        isArea: cfg.type === 1,
        historyData: query?.data,
      }
    }),
  })),
)
</script>

<template>
  <div v-if="!isDciTarget" class="perf-placeholder">
    <i class="pi pi-chart-line placeholder-icon" />
    <p class="placeholder-title">Performance charts unavailable</p>
    <p class="placeholder-text">
      Performance data collection is not available for this
      {{ object.class?.toLowerCase() ?? 'object' }}.
    </p>
  </div>

  <div v-else class="perf-view">
    <RefetchIndicator :is-fetching="(fetchingConfig || anyHistoryFetching) && !loadingConfig" />

    <div v-if="loadingConfig" class="perf-grid">
      <Skeleton v-for="i in 4" :key="i" height="320px" class="chart-skeleton" />
    </div>

    <!-- No chartable DCIs exist at all -->
    <EmptyState
      v-else-if="chartGroups.length === 0 && eligibleDcis.length === 0"
      icon="pi pi-chart-bar"
      title="No performance charts yet"
      message="Performance charts come from data collection items. Add one and enable it for the performance view to see it here."
    >
      <template #actions>
        <Button
          as="a"
          :href="resolveHref(newDciTarget)"
          label="Create data collection item"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="navClick($event, newDciTarget)"
        />
        <Button
          as="a"
          :href="resolveHref(dataCollectionTarget)"
          label="Open Data Collection"
          icon="pi pi-database"
          size="small"
          severity="secondary"
          outlined
          @click="navClick($event, dataCollectionTarget)"
        />
      </template>
    </EmptyState>

    <!-- Chartable DCIs exist but none are shown here -->
    <EmptyState
      v-else-if="chartGroups.length === 0"
      icon="pi pi-chart-bar"
      title="No performance charts yet"
      message="These metrics are collected but not shown here. Add one to the performance view:"
    >
      <ul class="eligible-list">
        <li v-for="dci in eligibleShown" :key="dci.id" class="eligible-item">
          <AppLink :to="dciPerfTarget(dci.id)" class="eligible-link">
            <span class="eligible-name">{{ dci.description || dci.name }}</span>
            <span class="eligible-action">
              Add to performance view
              <i class="pi pi-arrow-right" />
            </span>
          </AppLink>
        </li>
      </ul>
      <template #actions>
        <Button
          as="a"
          :href="resolveHref(dataCollectionTarget)"
          :label="
            eligibleDcis.length > eligibleShown.length
              ? `Configure Data Collection (${eligibleDcis.length})`
              : 'Configure Data Collection'
          "
          icon="pi pi-database"
          size="small"
          severity="secondary"
          outlined
          @click="navClick($event, dataCollectionTarget)"
        />
      </template>
    </EmptyState>

    <div v-else class="perf-grid">
      <PerfDciChart
        v-for="chart in chartsWithData"
        :key="chart.id"
        :title="chart.title"
        :series="chart.series"
        :chart-config="chart.chartConfig"
        :loading="chart.isLoading"
        :chart-target="chartTargetFor(chart)"
        @open-chart="router.push(chartTargetFor(chart))"
      />
    </div>
  </div>
</template>

<style scoped>
.perf-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
  overflow-y: auto;
}

.perf-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  padding: 1rem;
}

@container (max-width: 680px) {
  .perf-grid {
    grid-template-columns: 1fr;
  }
}

.chart-skeleton {
  height: 320px;
}

.perf-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  padding: 3rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.placeholder-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.placeholder-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.5rem;
}

.placeholder-text {
  font-size: 0.875rem;
  max-width: 380px;
  margin: 0;
  line-height: 1.5;
}

.eligible-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: start;
}

.eligible-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius, 6px);
  background: var(--p-surface-card);
  transition:
    border-color 0.15s,
    background 0.15s;
}

.eligible-link:hover {
  border-color: var(--p-primary-color);
  background: var(--p-highlight-background, var(--p-surface-hover));
}

.eligible-name {
  font-size: 0.875rem;
  color: var(--p-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eligible-action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--p-primary-color);
}
</style>
