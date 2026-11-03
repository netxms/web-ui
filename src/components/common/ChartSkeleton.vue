<script setup>
/**
 * Loading placeholder shaped like a line chart. Give it the chart's own height, so nothing moves
 * when the chart replaces it.
 */
defineProps({
  height: { type: String, default: '200px' },
  /** What a screen reader announces. */
  label: { type: String, default: 'Loading chart' },
})

const LINE = '0,30 8,26 16,31 24,22 32,27 40,16 48,24 56,19 64,27 72,13 80,21 88,17 100,23'
const AREA = `${LINE} 100,40 0,40`
</script>

<template>
  <div class="chart-skeleton" :style="{ height }" role="status">
    <span class="sr-only">{{ label }}</span>
    <div class="chart-skeleton__y-labels" aria-hidden="true">
      <span v-for="i in 5" :key="i" class="chart-skeleton__label" />
    </div>
    <div class="chart-skeleton__plot" aria-hidden="true">
      <span v-for="i in 5" :key="i" class="chart-skeleton__grid-line" />
      <svg class="chart-skeleton__series" viewBox="0 0 100 40" preserveAspectRatio="none">
        <polygon :points="AREA" class="chart-skeleton__area" />
        <polyline :points="LINE" class="chart-skeleton__line" vector-effect="non-scaling-stroke" />
      </svg>
      <i class="pi pi-spin pi-spinner chart-skeleton__spinner" />
    </div>
    <div class="chart-skeleton__x-labels" aria-hidden="true">
      <span v-for="i in 6" :key="i" class="chart-skeleton__label" />
    </div>
  </div>
</template>

<style scoped>
/* Well below the real chart's contrast, so the chart appearing reads as content arriving. */
.chart-skeleton {
  --chart-skeleton-ink: color-mix(in srgb, var(--p-text-muted-color) 14%, transparent);
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  grid-template-rows: 1fr 0.5rem;
  gap: 0.5rem;
  box-sizing: border-box;
  padding: 0.75rem 1rem 0.5rem 0.5rem;
}

.chart-skeleton__label {
  display: block;
  height: 0.375rem;
  border-radius: 2px;
  background: var(--chart-skeleton-ink);
  animation: chart-skeleton-pulse 1.6s ease-in-out infinite;
}

.chart-skeleton__y-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
}

.chart-skeleton__y-labels .chart-skeleton__label {
  width: 1.75rem;
}

.chart-skeleton__x-labels {
  grid-column: 2;
  display: flex;
  justify-content: space-between;
}

.chart-skeleton__x-labels .chart-skeleton__label {
  width: 2rem;
}

.chart-skeleton__plot {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.chart-skeleton__grid-line {
  display: block;
  border-top: 1px solid var(--p-content-border-color);
}

.chart-skeleton__series {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: chart-skeleton-pulse 1.6s ease-in-out infinite;
}

.chart-skeleton__area {
  fill: var(--chart-skeleton-ink);
  fill-opacity: 0.3;
}

.chart-skeleton__line {
  fill: none;
  stroke: color-mix(in srgb, var(--p-text-muted-color) 18%, transparent);
  stroke-width: 1.5;
}

.chart-skeleton__spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -0.5rem 0 0 -0.5rem;
  font-size: 1rem;
  color: var(--p-text-muted-color);
}

@keyframes chart-skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chart-skeleton__label,
  .chart-skeleton__series {
    animation: none;
  }
}
</style>
