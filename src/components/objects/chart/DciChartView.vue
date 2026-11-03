<script setup>
// The model lives only in the route query (written with router.replace), so there is no local
// copy to keep in sync.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import DciChartToolbar from '@/components/objects/chart/DciChartToolbar.vue'
import DciChartCanvas from '@/components/objects/chart/DciChartCanvas.vue'
import ChartStatsLegend from '@/components/common/ChartStatsLegend.vue'
import DciChartDataTable from '@/components/objects/chart/DciChartDataTable.vue'
import DciComparisonChart from '@/components/objects/chart/DciComparisonChart.vue'
import { useDciChartSeries } from '@/queries/useObjectQueries'
import { useChartTheme } from '@/utils/chartTheme'
import { buildSeriesPoints } from '@/utils/dciChartOptions'
import { parseFromQuery, serializeToQuery } from '@/utils/dciChartModel'
import { safeFilename, downloadCsv, toCsv } from '@/utils/csvExport'
import { objectTarget } from '@/utils/routeTargets'
import { notify } from '@/utils/notify'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()
const theme = useChartTheme()

const objectId = computed(() => props.object.id)

const model = computed(() => parseFromQuery(route.query, objectId.value))

function updateModel(next) {
  router.replace({
    name: route.name,
    params: route.params,
    query: serializeToQuery(next, objectId.value),
  })
}

const queries = useDciChartSeries(model)

const isLoading = computed(() => queries.value.some((q) => q.isLoading))
const isFetching = computed(() => queries.value.some((q) => q.isFetching))
const failed = computed(() => queries.value.filter((q) => q.isError))
// Only a total failure replaces the chart; partial failures are noted above it.
const allFailed = computed(
  () => queries.value.length > 0 && failed.value.length === queries.value.length,
)

function retryFailed() {
  for (const q of queries.value) {
    if (q.isError) q.refetch()
  }
}

function refetchAll() {
  for (const q of queries.value) q.refetch()
}

// The server returns history newest-first; the legend's "Curr" and comparison mode read the
// array in order, so sort oldest-first once here.
const series = computed(() =>
  model.value.dcis.map((dci, i) => {
    const data = queries.value[i]?.data
    const values = [...(data?.values ?? [])].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    )
    return {
      name: dci.label || data?.description || `DCI ${dci.dciId}`,
      values,
      unitName: data?.unitName ?? '',
      aggregated: data?.aggregated ?? false,
      color: dci.color,
    }
  }),
)

const seriesPoints = computed(() => buildSeriesPoints(series.value, theme))

// `render.legend` is the position ('none' hides it), as in the legacy client. Unlike a dashboard
// widget, it is not overridden for narrow viewports: the toolbar setting it is right there.
const legendPlace = computed(() => {
  const legend = model.value.render?.legend
  return legend && legend !== 'none' ? legend : 'bottom'
})

const showStatsLegend = computed(
  () => model.value.render?.legend !== 'none' && model.value.render?.extendedLegend === true,
)

const hasAnyPoints = computed(() => seriesPoints.value.some((s) => s.points.length > 0))

// The server downgrades an explicit tier to raw when the DCI has no aggregates.
const servedTier = computed(() => {
  const tiers = new Set(queries.value.map((q) => q.data?.tierServed).filter(Boolean))
  return tiers.size === 1 ? [...tiers][0] : null
})

const tierDowngraded = computed(
  () =>
    model.value.tier !== 'auto' &&
    servedTier.value != null &&
    servedTier.value !== model.value.tier,
)

const canvasRef = ref(null)
const tableRef = ref(null)

function resetZoom() {
  canvasRef.value?.resetZoom()
}

function zoomIn() {
  canvasRef.value?.zoomIn()
}

function zoomOut() {
  canvasRef.value?.zoomOut()
}

const exportStem = computed(() =>
  safeFilename(
    `${props.object.name ?? 'object'}-${seriesPoints.value.map((s) => s.name).join('-')}`,
    'dci-chart',
  ).slice(0, 120),
)

async function onExport(kind) {
  if (kind === 'csv') {
    // In chart mode the table is not mounted.
    if (model.value.mode === 'table') tableRef.value?.exportCsv()
    else exportPointsAsCsv()
    return
  }

  const dataUrl = canvasRef.value?.getDataURL()
  if (!dataUrl) return

  if (kind === 'png') {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${exportStem.value}.png`
    document.body.append(link)
    link.click()
    link.remove()
    return
  }

  try {
    const blob = await (await fetch(dataUrl)).blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    notify({ summary: 'Chart copied to clipboard' })
  } catch {
    // Firefox has no image clipboard write, and any browser refuses without permission.
    notify({
      severity: 'warn',
      summary: 'Could not copy the image',
      detail: 'Use "Save as image" instead.',
    })
  }
}

function exportPointsAsCsv() {
  const columns = [
    { field: 'timestamp', label: 'Timestamp' },
    ...seriesPoints.value.map((s, i) => ({
      field: `s${i}`,
      label: s.unit ? `${s.name} (${s.unit})` : s.name,
    })),
  ]
  const byTime = new Map()
  seriesPoints.value.forEach((s, i) => {
    for (const [time, value] of s.points) {
      if (!byTime.has(time)) byTime.set(time, { timestamp: new Date(time).toISOString() })
      byTime.get(time)[`s${i}`] = value
    }
  })
  const rows = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row)
  downloadCsv(exportStem.value, toCsv(rows, columns))
}

async function copyLink() {
  const href = new URL(router.resolve(route).href, globalThis.location.origin).toString()
  try {
    await navigator.clipboard.writeText(href)
    notify({ summary: 'Link copied to clipboard' })
  } catch {
    notify({ severity: 'warn', summary: 'Could not copy the link' })
  }
}

function setMarkers(markers) {
  updateModel({ ...model.value, markers })
}

function addMarker() {
  canvasRef.value?.addMarkerAtCentre()
}

function clearMarkers() {
  setMarkers([])
}

const dataCollectionTarget = computed(() => objectTarget(props.object, 'dcis'))

// A new object makes the charted DCIs foreign, so start over rather than 404 on every series.
watch(objectId, (id, previous) => {
  if (previous != null && id !== previous && model.value.dcis.length) {
    router.replace({ name: route.name, params: route.params, query: {} })
  }
})
</script>

<template>
  <div class="dci-chart-view">
    <DciChartToolbar
      :model="model"
      :has-data="hasAnyPoints"
      @update="updateModel"
      @refresh="refetchAll"
      @reset-zoom="resetZoom"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @add-marker="addMarker"
      @clear-markers="clearMarkers"
      @copy-link="copyLink"
      @export="onExport"
    />

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <EmptyState
      v-if="!model.dcis.length"
      icon="pi pi-chart-line"
      title="No metrics selected"
      message="Pick one or more data collection items to chart them here."
    >
      <template #actions>
        <Button
          as="a"
          :href="router.resolve(dataCollectionTarget).href"
          label="Open Data Collection"
          icon="pi pi-database"
          size="small"
          severity="secondary"
          outlined
          @click.prevent="router.push(dataCollectionTarget)"
        />
      </template>
    </EmptyState>

    <LoadingState v-else-if="isLoading" message="Loading history…" />

    <QueryErrorState
      v-else-if="allFailed"
      :error="failed[0].error"
      message="Failed to load history"
      @retry="retryFailed"
    />

    <div v-else class="dci-chart-view__body">
      <div v-if="failed.length" class="dci-chart-view__notice" aria-live="polite">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>
          {{ $plural(failed.length, 'metric') }} could not be loaded and
          {{ failed.length === 1 ? 'is' : 'are' }}
          missing from this chart.
        </span>
        <Button label="Retry" size="small" text @click="retryFailed" />
      </div>

      <div v-if="tierDowngraded" class="dci-chart-view__notice" aria-live="polite">
        <i class="pi pi-info-circle" aria-hidden="true" />
        <span>
          No {{ model.tier }} averages are stored for these metrics, so raw samples are shown.
        </span>
      </div>

      <template v-if="model.mode === 'table'">
        <DciChartDataTable ref="tableRef" :series="seriesPoints" :export-name="exportStem" />
      </template>

      <DciComparisonChart
        v-else-if="model.mode === 'comparison'"
        :series="seriesPoints"
        :type="model.comparisonType"
        :legend="model.render.legend"
        :extended-legend="model.render.extendedLegend === true"
      />

      <template v-else>
        <div class="dci-chart-view__plot" :class="`dci-chart-view__plot--legend-${legendPlace}`">
          <DciChartCanvas
            ref="canvasRef"
            :model="model"
            :series="series"
            @update:markers="setMarkers"
          />
          <ChartStatsLegend v-if="showStatsLegend" :series="seriesPoints" :place="legendPlace" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dci-chart-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
  position: relative;
}

.dci-chart-view__plot {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.dci-chart-view__plot--legend-left,
.dci-chart-view__plot--legend-right {
  flex-direction: row;
}

.dci-chart-view__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.dci-chart-view__notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-surface-ground);
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.dci-chart-view__notice .pi {
  color: var(--p-orange-500, #f59e0b);
}
</style>
