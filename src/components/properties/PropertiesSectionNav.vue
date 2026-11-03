<script setup>
import { groupSections } from '@/config/propertySections'
import { computed } from 'vue'
import { useNavTarget } from '@/composables/useNavTarget'

const props = defineProps({
  sections: {
    type: Array,
    required: true,
  },
  activeSection: {
    type: String,
    default: null,
  },
  /** @type {import('vue').PropType<(sectionId: string) => object>} */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['select'])

const { navBindings } = useNavTarget()

const groups = computed(() => groupSections(props.sections))

function sectionBindings(sectionId) {
  return navBindings(props.targetFor?.(sectionId) ?? null, () => emit('select', sectionId))
}
</script>

<template>
  <nav class="section-nav">
    <div v-for="group in groups" :key="group.label" class="section-group">
      <div class="section-group-label">{{ group.label }}</div>
      <button
        v-for="section in group.sections"
        :key="section.id"
        class="section-item"
        :class="{ active: section.id === activeSection }"
        :data-tour="`properties-section-${section.id}`"
        v-bind="sectionBindings(section.id)"
      >
        <i v-if="section.icon" :class="section.icon" class="section-item-icon" />
        <span class="section-item-label">{{ section.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.section-nav {
  width: 11rem;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--p-surface-border);
  padding: 0.5rem 0;
}

.section-group {
  padding: 0.25rem 0;
}

.section-group:not(:last-child) {
  margin-bottom: 0.25rem;
}

.section-group-label {
  padding: 0.375rem 0.75rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.75rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--p-text-color);
  text-align: left;
  border-radius: 0;
  transition: background-color 0.15s;
}

.section-item:hover {
  background: var(--p-surface-hover);
}

.section-item.active {
  background: var(--p-primary-50);
  color: var(--p-primary-color);
  font-weight: 600;
}

.section-item-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
  opacity: 0.7;
}

.section-item.active .section-item-icon {
  opacity: 1;
}

.section-item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
