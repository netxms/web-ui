<script setup>
import { computed } from 'vue'
import ObjectPickerDialog from './ObjectPickerDialog.vue'
import { useObjects } from '@/queries/useObjectQueries'

const props = defineProps({
  visible: { type: Boolean, required: true },
  title: { type: String, default: 'Select Object' },
  selectable: { type: Function, default: () => true },
  /** Shows only matching nodes and their ancestors. */
  displayFilter: { type: Function, default: null },
  /**
   * Root object classes of the perspective tabs; empty shows all.
   * @type {string[]}
   */
  perspectiveClasses: { type: Array, default: () => [] },
  /** Ctrl+click toggles objects; `select` then emits an array. */
  multiSelect: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'select'])

const CLASS_PERSPECTIVE_MAP = {
  ServiceRoot: 'Infrastructure',
  TemplateRoot: 'Templates',
  AssetRoot: 'Assets',
  NetworkMapRoot: 'Network Maps',
  DashboardRoot: 'Dashboards',
  BusinessServiceRoot: 'Business Services',
  Network: 'Network',
}

const { data: rootObjects } = useObjects()

const perspectives = computed(() => {
  const roots = rootObjects.value ?? []
  const allowed = props.perspectiveClasses
  const found = roots
    .filter((o) => CLASS_PERSPECTIVE_MAP[o.class])
    .filter((o) => allowed.length === 0 || allowed.includes(o.class))
    .map((o) => ({ id: String(o.id), label: CLASS_PERSPECTIVE_MAP[o.class], rootId: o.id }))
  // While roots are loading
  return found.length ? found : [{ id: '2', label: 'Infrastructure', rootId: 2 }]
})
</script>

<template>
  <ObjectPickerDialog
    :visible="visible"
    :title="title"
    :perspectives="perspectives"
    :selectable="selectable"
    :display-filter="displayFilter"
    :show-perspective-root="true"
    :multi-select="multiSelect"
    @update:visible="emit('update:visible', $event)"
    @select="emit('select', $event)"
  />
</template>
