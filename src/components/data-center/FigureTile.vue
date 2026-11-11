<script setup>
import { computed } from 'vue'
import InfoHint from '@/components/common/InfoHint.vue'
import { getClassIconColor } from '@/utils/objectUtils'

/**
 * One live figure: a small caps label, an icon badge, the value and a note below it. The tone
 * tints the tile in the color of the class it is about, as the tree draws that class's icon; it
 * says nothing about status.
 */
const props = defineProps({
  label: { type: String, required: true },
  /** Lucide icon component */
  icon: { type: [Object, Function], default: null },
  /** 'power', 'cooling' or 'water' */
  tone: { type: String, default: 'power' },
  /** Formatted value, '—' without one */
  value: { type: String, required: true },
  unit: { type: String, default: '' },
  note: { type: String, default: '' },
  /** Where the figure comes from, behind an info icon beside the label */
  info: { type: String, default: '' },
})

const TONE_CLASS = { power: 'PowerDomain', cooling: 'CoolingZone', water: 'Facility' }

const hue = computed(() => ({ '--tile-hue': getClassIconColor(TONE_CLASS[props.tone]) }))
</script>

<template>
  <section class="figure-tile" :style="hue">
    <header class="figure-tile__header">
      <span class="figure-tile__title">
        <h3 class="figure-tile__label">{{ label }}</h3>
        <InfoHint v-if="info" :text="info" :label="label" />
      </span>
      <span v-if="icon" class="figure-tile__badge" aria-hidden="true">
        <component :is="icon" :size="16" />
      </span>
    </header>
    <span class="figure-tile__value">
      {{ value }}<small v-if="unit && value !== '—'">{{ unit }}</small>
    </span>
    <slot />
    <span v-if="note" class="figure-tile__note">{{ note }}</span>
  </section>
</template>

<style scoped>
.figure-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.75rem 1rem 0.875rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-lg, 8px);
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--tile-hue) 11%, var(--p-content-background)) 0%,
    var(--p-content-background) 65%
  );
}

.figure-tile__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.figure-tile__title {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.figure-tile__label {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.figure-tile__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tile-hue) 18%, var(--p-content-background));
  color: color-mix(in srgb, var(--tile-hue) 70%, var(--p-text-color));
}

.figure-tile__value {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.figure-tile__value small {
  margin-inline-start: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.figure-tile__note {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
