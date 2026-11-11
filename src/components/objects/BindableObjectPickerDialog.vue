<script setup>
import { computed } from 'vue'
import ObjectPickerDialog from './ObjectPickerDialog.vue'
import { useObjects } from '@/queries/useObjectQueries'
import { bindableChildClasses } from '@/utils/objectCreationRules'

const props = defineProps({
  visible: { type: Boolean, required: true },
  // Defaults to what `parentClass` takes, or to container-membership classes.
  classes: { type: Array, default: null },
  parentClass: { type: String, default: null },
})

const emit = defineEmits(['update:visible', 'select'])

const BINDABLE_CHILD_CLASSES = new Set([
  'Node',
  'Cluster',
  'Container',
  'Collector',
  'Chassis',
  'Rack',
  'MobileDevice',
  'Sensor',
  'Condition',
])

const CLASS_PERSPECTIVE_MAP = {
  ServiceRoot: { id: 'infrastructure', label: 'Infrastructure' },
  Network: { id: 'network', label: 'Entire Network' },
}

const { data: rootObjects } = useObjects()

const perspectives = computed(() => {
  const roots = rootObjects.value ?? []
  const found = roots
    .filter((o) => CLASS_PERSPECTIVE_MAP[o.class])
    .map((o) => ({ ...CLASS_PERSPECTIVE_MAP[o.class], rootId: o.id }))
  return found.length ? found : [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }]
})

const bindableClasses = computed(() => {
  if (props.classes) return new Set(props.classes)
  if (props.parentClass) return new Set(bindableChildClasses(props.parentClass))
  return BINDABLE_CHILD_CLASSES
})

function isBindable(node) {
  return bindableClasses.value.has(node.class)
}
</script>

<template>
  <ObjectPickerDialog
    :visible="visible"
    title="Select Object to Bind"
    :perspectives="perspectives"
    :selectable="isBindable"
    multi-select
    @update:visible="emit('update:visible', $event)"
    @select="emit('select', $event)"
  />
</template>
