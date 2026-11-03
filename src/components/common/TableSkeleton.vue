<script setup>
/**
 * Loading placeholder shaped like an AppTable. Match the table's column proportions and page
 * size, so little moves when it is replaced.
 */
defineProps({
  /** One CSS grid track per column, e.g. `['180px', '1fr']`. */
  columns: { type: Array, default: () => ['1fr', '2fr'] },
  rows: { type: Number, default: 5 },
  /** What a screen reader announces. */
  label: { type: String, default: 'Loading table' },
})

// Cycled so the rows do not look stamped out.
const BAR_WIDTHS = ['72%', '48%', '86%', '60%', '38%', '78%', '54%']

function barWidth(row, col) {
  return BAR_WIDTHS[(row * 3 + col * 2) % BAR_WIDTHS.length]
}
</script>

<template>
  <div class="table-skeleton" :style="{ gridTemplateColumns: columns.join(' ') }" role="status">
    <span class="sr-only">{{ label }}</span>
    <span
      v-for="(_, col) in columns"
      :key="`head-${col}`"
      class="table-skeleton__cell table-skeleton__cell--head"
      aria-hidden="true"
    >
      <span class="table-skeleton__bar" style="width: 40%" />
    </span>
    <template v-for="row in rows" :key="row">
      <span v-for="(_, col) in columns" :key="col" class="table-skeleton__cell" aria-hidden="true">
        <span class="table-skeleton__bar" :style="{ width: barWidth(row, col) }" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.table-skeleton {
  display: grid;
}

/* About the height and padding of an AppTable row at its default (small) size. */
.table-skeleton__cell {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 1.625rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.table-skeleton__cell--head {
  border-bottom-width: 2px;
}

.table-skeleton__bar {
  display: block;
  height: 0.375rem;
  border-radius: 2px;
  background: color-mix(in srgb, var(--p-text-muted-color) 14%, transparent);
  animation: table-skeleton-pulse 1.6s ease-in-out infinite;
}

.table-skeleton__cell--head .table-skeleton__bar {
  background: color-mix(in srgb, var(--p-text-muted-color) 20%, transparent);
}

@keyframes table-skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .table-skeleton__bar {
    animation: none;
  }
}
</style>
