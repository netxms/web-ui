<script setup>
/**
 * One muted footer line, expandable, naming each navigation item hidden by permissions and the
 * right it needs, so a user told where to go can tell "withheld" from "missing". Renders
 * nothing when nothing is hidden. Rows are inert.
 */
import { ref, computed } from 'vue'
import { labelForRight } from '@/auth/systemRights'

const props = defineProps({
  /** `{ id, label, requiredRight }` from a registry's hidden* selector. */
  items: { type: Array, default: () => [] },
  /** Singular, e.g. "section", "perspective", "tool". */
  noun: { type: String, default: 'item' },
  /** Lock icon with a tooltip only (the collapsed nav rail). */
  iconOnly: { type: Boolean, default: false },
})

const expanded = ref(false)

const summary = computed(() => {
  const n = props.items.length
  return `${n} ${props.noun}${n === 1 ? '' : 's'} hidden by your permissions`
})

/** The first of an any-of list is enough to explain the gap. */
function rightLabelFor(item) {
  const required = item?.requiredRight
  if (!required) return null
  return labelForRight(Array.isArray(required) ? required[0] : required)
}
</script>

<template>
  <div v-if="items.length" class="restricted-disclosure">
    <button
      v-if="iconOnly"
      v-tooltip.right="summary"
      type="button"
      class="rd-icon-button"
      :aria-label="summary"
      @click="expanded = !expanded"
    >
      <i class="pi pi-lock" />
    </button>

    <button
      v-else
      type="button"
      class="rd-summary"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <i class="pi pi-lock rd-lock" />
      <span class="rd-summary-text">{{ summary }}</span>
      <i class="pi" :class="expanded ? 'pi-chevron-up' : 'pi-chevron-down'" />
    </button>

    <ul v-if="expanded && !iconOnly" class="rd-list">
      <!-- Nav items are keyed by route, registry entries by id. -->
      <li v-for="item in items" :key="item.id ?? item.route ?? item.label" class="rd-item">
        <i class="pi pi-lock rd-lock" />
        <span class="rd-item-label">{{ item.label }}</span>
        <span v-if="rightLabelFor(item)" class="rd-item-right">
          needs "{{ rightLabelFor(item) }}"
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.restricted-disclosure {
  border-top: 1px solid var(--p-surface-border);
  padding: 0.25rem 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.rd-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--p-border-radius-sm, 4px);
}

.rd-summary:hover,
.rd-summary:focus-visible {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.rd-summary-text {
  flex: 1;
  min-width: 0;
}

.rd-lock {
  font-size: 0.75rem;
  opacity: 0.7;
  flex-shrink: 0;
}

.rd-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.5rem;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}

.rd-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0.375rem;
}

/* Inert rows: no hover affordance. */
.rd-item {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  padding: 0.1875rem 0.75rem 0.1875rem 1.25rem;
  opacity: 0.75;
}

.rd-item-label {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rd-item-right {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
  font-style: italic;
}
</style>
