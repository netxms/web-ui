<script setup>
// Emits a whole replacement model: one `update` per interaction keeps one router call per action.
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Popover from 'primevue/popover'
import Menu from 'primevue/menu'
import { DATA_TIERS, LEGEND_PLACEMENTS, DEFAULT_LEGEND_PLACEMENT } from '@/utils/dciChartModel'
import TimeRangeButton from '@/components/common/TimeRangeButton.vue'
import { useChartTheme } from '@/utils/chartTheme'

const props = defineProps({
  model: { type: Object, required: true },
  /** Enables the export actions. */
  hasData: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update',
  'refresh',
  'reset-zoom',
  'zoom-in',
  'zoom-out',
  'copy-link',
  'export',
  'add-marker',
  'clear-markers',
])

// From the chart theme rather than a CSS token: that is where ECharts reads it from.
const chartTheme = useChartTheme()
const markerVars = computed(() => ({
  '--chart-marker': chartTheme.ink.value.marker,
  '--chart-marker-text': chartTheme.ink.value.markerText,
}))

const markersActive = computed(() => props.model.markers?.length > 0)

function patch(changes) {
  emit('update', { ...props.model, ...changes })
}

function patchRender(changes) {
  patch({ render: { ...props.model.render, ...changes } })
}

// `render.legend` is 'none' when hidden, so the last edge is remembered here (not in the URL).
const lastLegendPlacement = ref(props.model.render?.legend ?? DEFAULT_LEGEND_PLACEMENT)

watch(
  () => props.model.render?.legend,
  (legend) => {
    if (legend && legend !== 'none') lastLegendPlacement.value = legend
  },
)

const MODE_OPTIONS = [
  { label: 'Chart', value: 'line', icon: 'pi pi-chart-line' },
  { label: 'Data', value: 'table', icon: 'pi pi-table' },
  { label: 'Compare', value: 'comparison', icon: 'pi pi-chart-bar' },
]

const COMPARISON_OPTIONS = [
  { label: 'Bar', value: 'bar' },
  { label: 'Pie', value: 'pie' },
]

const optionsPopover = ref(null)

const exportMenu = ref(null)

const exportItems = computed(() => {
  const items = []
  if (props.model.mode === 'table') {
    items.push({
      label: 'Download CSV',
      icon: 'pi pi-file',
      command: () => emit('export', 'csv'),
    })
  } else {
    items.push(
      { label: 'Save as image', icon: 'pi pi-image', command: () => emit('export', 'png') },
      { label: 'Copy image', icon: 'pi pi-copy', command: () => emit('export', 'clipboard') },
    )
  }
  items.push(
    { separator: true },
    { label: 'Copy link to this chart', icon: 'pi pi-link', command: () => emit('copy-link') },
  )
  return items
})
</script>

<template>
  <div class="chart-toolbar">
    <SelectButton
      :model-value="model.mode"
      :options="MODE_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      aria-label="Chart mode"
      @update:model-value="(mode) => mode && patch({ mode })"
    />

    <SelectButton
      v-if="model.mode === 'comparison'"
      :model-value="model.comparisonType"
      :options="COMPARISON_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      aria-label="Comparison type"
      @update:model-value="(comparisonType) => comparisonType && patch({ comparisonType })"
    />

    <span class="chart-toolbar__spacer" />

    <TimeRangeButton :model-value="model.time" @update:model-value="(time) => patch({ time })" />

    <!-- Comparison mode only reads the latest value. -->
    <Select
      v-if="model.mode !== 'comparison'"
      :model-value="model.tier"
      :options="DATA_TIERS"
      option-label="label"
      option-value="id"
      size="small"
      class="chart-toolbar__tier"
      aria-label="Data resolution"
      :disabled="model.raw"
      v-tooltip.bottom="
        model.raw ? 'A raw chart always reads raw samples' : 'Which stored resolution to read'
      "
      @update:model-value="(tier) => patch({ tier })"
    />

    <Button
      :icon="model.live ? 'pi pi-pause' : 'pi pi-play'"
      :label="model.live ? `Live ${model.refreshSeconds}s` : 'Live'"
      size="small"
      :severity="model.live ? 'primary' : 'secondary'"
      :outlined="!model.live"
      :aria-pressed="model.live"
      v-tooltip.bottom="model.live ? 'Stop refreshing' : 'Refresh automatically'"
      @click="patch({ live: !model.live })"
    />

    <Button
      v-tooltip.bottom="'Refresh now'"
      icon="pi pi-refresh"
      size="small"
      severity="secondary"
      text
      aria-label="Refresh now"
      @click="emit('refresh')"
    />

    <!-- On the bar, not a context menu, which is unreachable on a touch screen. -->
    <template v-if="model.mode === 'line'">
      <div class="chart-toolbar__group" role="group" aria-label="Zoom">
        <Button
          v-tooltip.bottom="'Zoom in'"
          icon="pi pi-search-plus"
          size="small"
          severity="secondary"
          text
          aria-label="Zoom in"
          @click="emit('zoom-in')"
        />
        <Button
          v-tooltip.bottom="'Zoom out'"
          icon="pi pi-search-minus"
          size="small"
          severity="secondary"
          text
          aria-label="Zoom out"
          @click="emit('zoom-out')"
        />
        <Button
          v-tooltip.bottom="'Fit to window'"
          icon="pi pi-arrows-h"
          size="small"
          severity="secondary"
          text
          aria-label="Fit to window"
          @click="emit('reset-zoom')"
        />
      </div>

      <div
        class="chart-toolbar__group chart-toolbar__group--markers"
        :class="{ 'chart-toolbar__group--active': markersActive }"
        :style="markerVars"
        role="group"
        aria-label="Markers"
      >
        <Button
          v-tooltip.bottom="'Add a marker (or shift-click the chart to place one exactly)'"
          icon="pi pi-map-marker"
          size="small"
          severity="secondary"
          text
          class="chart-toolbar__marker-btn"
          aria-label="Add marker"
          @click="emit('add-marker')"
        />
        <Button
          v-if="model.markers?.length"
          v-tooltip.bottom="'Remove all markers'"
          icon="pi pi-eraser"
          size="small"
          severity="secondary"
          text
          class="chart-toolbar__marker-btn"
          aria-label="Remove all markers"
          @click="emit('clear-markers')"
        />
      </div>
    </template>

    <Button
      v-if="model.mode === 'line'"
      v-tooltip.bottom="'Chart options'"
      icon="pi pi-sliders-h"
      size="small"
      severity="secondary"
      text
      aria-label="Chart options"
      @click="optionsPopover.toggle($event)"
    />
    <Popover ref="optionsPopover">
      <div class="options-panel">
        <div class="options-panel__label">Rendering</div>

        <label class="options-panel__check" for="chart-opt-area">
          <Checkbox
            input-id="chart-opt-area"
            :model-value="model.render.area"
            :binary="true"
            @update:model-value="(area) => patchRender({ area })"
          />
          Area chart
        </label>
        <label class="options-panel__check" for="chart-opt-stacked">
          <Checkbox
            input-id="chart-opt-stacked"
            :model-value="model.render.stacked"
            :binary="true"
            @update:model-value="(stacked) => patchRender({ stacked })"
          />
          Stacked
        </label>
        <label class="options-panel__check" for="chart-opt-translucent">
          <Checkbox
            input-id="chart-opt-translucent"
            :model-value="model.render.translucent"
            :binary="true"
            :disabled="!model.render.area && !model.render.stacked"
            @update:model-value="(translucent) => patchRender({ translucent })"
          />
          Translucent
        </label>
        <label class="options-panel__check" for="chart-opt-log">
          <Checkbox
            input-id="chart-opt-log"
            :model-value="model.render.log"
            :binary="true"
            @update:model-value="(log) => patchRender({ log })"
          />
          Logarithmic scale
        </label>
        <label class="options-panel__check" for="chart-opt-grid">
          <Checkbox
            input-id="chart-opt-grid"
            :model-value="model.render.showGrid"
            :binary="true"
            @update:model-value="(showGrid) => patchRender({ showGrid })"
          />
          Show grid
        </label>

        <div class="options-panel__label">Analysis</div>

        <label class="options-panel__check" for="chart-opt-p95">
          <Checkbox
            input-id="chart-opt-p95"
            :model-value="model.percentile === 95"
            :binary="true"
            @update:model-value="(on) => patch({ percentile: on ? 95 : null })"
          />
          Show 95th percentile
        </label>
        <label class="options-panel__check" for="chart-opt-band">
          <Checkbox
            input-id="chart-opt-band"
            :model-value="model.band"
            :binary="true"
            :disabled="model.raw"
            @update:model-value="(band) => patch({ band })"
          />
          Show min/max band
        </label>
        <p v-if="model.band && !model.raw" class="options-panel__hint">
          Only drawn where the server serves hourly or daily averages.
        </p>
        <label class="options-panel__check" for="chart-opt-raw">
          <Checkbox
            input-id="chart-opt-raw"
            :model-value="model.raw"
            :binary="true"
            @update:model-value="(raw) => patch({ raw, band: raw ? false : model.band })"
          />
          Raw data
        </label>

        <div class="options-panel__label">Legend</div>

        <label class="options-panel__check" for="chart-opt-legend">
          <Checkbox
            input-id="chart-opt-legend"
            :model-value="model.render.legend !== 'none'"
            :binary="true"
            @update:model-value="(on) => patchRender({ legend: on ? lastLegendPlacement : 'none' })"
          />
          Show legend
        </label>
        <div
          v-if="model.render.legend !== 'none'"
          class="options-panel__row options-panel__row--labelled"
        >
          <label class="options-panel__inline-label" for="chart-opt-legendpos">Position</label>
          <Select
            input-id="chart-opt-legendpos"
            :model-value="model.render.legend"
            :options="LEGEND_PLACEMENTS"
            option-label="label"
            option-value="id"
            size="small"
            aria-label="Legend position"
            @update:model-value="(legend) => patchRender({ legend })"
          />
        </div>
        <label class="options-panel__check" for="chart-opt-extlegend">
          <Checkbox
            input-id="chart-opt-extlegend"
            :model-value="model.render.extendedLegend"
            :binary="true"
            :disabled="model.render.legend === 'none'"
            @update:model-value="(extendedLegend) => patchRender({ extendedLegend })"
          />
          Extended legend
        </label>

        <div class="options-panel__label">Y axis</div>

        <label class="options-panel__check" for="chart-opt-autoy">
          <Checkbox
            input-id="chart-opt-autoy"
            :model-value="model.yAxis.auto"
            :binary="true"
            @update:model-value="(auto) => patch({ yAxis: { ...model.yAxis, auto } })"
          />
          Automatic scale
        </label>
        <div v-if="!model.yAxis.auto" class="options-panel__row">
          <InputNumber
            :model-value="model.yAxis.min"
            placeholder="Min"
            size="small"
            :max-fraction-digits="4"
            aria-label="Y axis minimum"
            @update:model-value="(min) => patch({ yAxis: { ...model.yAxis, min } })"
          />
          <InputNumber
            :model-value="model.yAxis.max"
            placeholder="Max"
            size="small"
            :max-fraction-digits="4"
            aria-label="Y axis maximum"
            @update:model-value="(max) => patch({ yAxis: { ...model.yAxis, max } })"
          />
        </div>

        <div v-if="model.live" class="options-panel__row options-panel__row--labelled">
          <label class="options-panel__inline-label" for="chart-opt-refresh"> Refresh every </label>
          <InputNumber
            input-id="chart-opt-refresh"
            :model-value="model.refreshSeconds"
            :min="5"
            :max="3600"
            suffix=" s"
            size="small"
            @update:model-value="(refreshSeconds) => refreshSeconds && patch({ refreshSeconds })"
          />
        </div>
      </div>
    </Popover>

    <Button
      v-tooltip.bottom="'Export'"
      icon="pi pi-download"
      size="small"
      severity="secondary"
      text
      :disabled="!hasData"
      aria-haspopup="true"
      aria-controls="chart-export-menu"
      aria-label="Export"
      @click="exportMenu.toggle($event)"
    />
    <Menu id="chart-export-menu" ref="exportMenu" :model="exportItems" :popup="true" />
  </div>
</template>

<style scoped>
.chart-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-surface-card);
}

.chart-toolbar__spacer {
  flex: 1;
  min-width: 0;
}

.chart-toolbar__tier {
  min-width: 9rem;
}

.chart-toolbar__group {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding-left: 0.375rem;
  border-left: 1px solid var(--p-content-border-color);
}

.chart-toolbar__group--markers.chart-toolbar__group--active {
  border-radius: var(--p-border-radius, 6px);
  background: color-mix(in srgb, var(--chart-marker) 12%, transparent);
  padding-inline: 0.25rem;
}

.chart-toolbar__marker-btn :deep(.p-button-icon) {
  color: var(--chart-marker);
}

.options-panel__label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.options-panel__label:not(:first-child) {
  margin-top: 0.5rem;
}

.options-panel {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 15rem;
}

.options-panel__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-color);
  cursor: pointer;
}

.options-panel__hint {
  margin: -0.125rem 0 0 1.75rem;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--p-text-muted-color);
}

.options-panel__row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.options-panel__row :deep(.p-inputnumber),
.options-panel__row :deep(.p-select) {
  flex: 1;
  min-width: 0;
}

.options-panel__row :deep(input) {
  width: 100%;
}

.options-panel__row--labelled {
  margin-top: 0.5rem;
}

.options-panel__inline-label {
  font-size: 0.8125rem;
  color: var(--p-text-color);
  white-space: nowrap;
}
</style>
