<script setup>
import { computed, ref, watch } from 'vue'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import ContainerPickerDialog from './ContainerPickerDialog.vue'
import { useObject, useObjectsByIds } from '@/queries/useObjectQueries'
import { CONTAINER_PARENT_CLASSES } from '@/utils/objectCreationRules'

const props = defineProps({
  visible: { type: Boolean, required: true },
  objects: { type: Array, required: true },
  /**
   * Object id -> the parent of the tree row it was picked on. A move without one (from the
   * header) is limited to a single object, whose container is then looked up.
   * @type {import('vue').PropType<Map<number, object>|null>}
   */
  treeParents: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'select'])

function rowSource(object) {
  const parent = props.treeParents?.get(object.id)
  return parent && CONTAINER_PARENT_CLASSES.has(parent.class) ? parent : null
}

const single = computed(() => (props.objects.length === 1 ? props.objects[0] : null))
const lookupId = computed(() => (single.value && !rowSource(single.value) ? single.value.id : null))

// Tree nodes carry no parent ids; the full object does.
const { data: fullObject, isLoading: isObjectLoading } = useObject(lookupId)
const parentIds = computed(() => (lookupId.value ? (fullObject.value?.parents ?? []) : []))
const { objectsById, unresolvedIds } = useObjectsByIds(parentIds)
const candidates = computed(() =>
  parentIds.value
    .map((id) => objectsById.value.get(id))
    .filter((o) => o && CONTAINER_PARENT_CLASSES.has(o.class)),
)
const isLookingUp = computed(
  () =>
    lookupId.value != null &&
    (isObjectLoading.value ||
      objectsById.value.size + unresolvedIds.value.length < parentIds.value.length),
)

const chosenId = ref(null)
watch(
  candidates,
  (list) => {
    if (!list.some((o) => o.id === chosenId.value)) chosenId.value = list[0]?.id ?? null
  },
  { immediate: true },
)

const moves = computed(() =>
  props.objects.map((object) => ({
    object,
    source: rowSource(object) ?? candidates.value.find((o) => o.id === chosenId.value) ?? null,
  })),
)
const ready = computed(() => moves.value.length > 0 && moves.value.every((m) => m.source))
const sharedSource = computed(() => {
  const ids = new Set(moves.value.map((m) => m.source?.id))
  return ids.size === 1 ? moves.value[0].source : null
})

function onSelect(target) {
  if (!ready.value) return
  emit('select', { target, moves: moves.value })
}
</script>

<template>
  <ContainerPickerDialog
    :visible="visible"
    title="Move to Container"
    :objects="objects"
    :exclude-ids="sharedSource ? [sharedSource.id] : []"
    :multi-select="false"
    :confirm-disabled="!ready"
    @update:visible="emit('update:visible', $event)"
    @select="onSelect"
  >
    <div v-if="single && !rowSource(single) && !isLookingUp && !candidates.length" class="move-intro">
      <span class="move-intro__empty">
        <strong>{{ single.name }}</strong> is not in any container. Use "Bind to container..."
        instead.
      </span>
    </div>
    <div v-else-if="single" class="move-intro">
      <span>
        Move <strong>{{ single.name }}</strong>
      </span>
      <template v-if="rowSource(single)">
        <span>
          from <strong>{{ rowSource(single).name }}</strong> to:
        </span>
      </template>
      <Skeleton v-else-if="isLookingUp" width="10rem" height="1.5rem" />
      <template v-else-if="candidates.length === 1">
        <span>
          from <strong>{{ candidates[0].name }}</strong> to:
        </span>
      </template>
      <template v-else>
        <span>from</span>
        <Select
          v-model="chosenId"
          :options="candidates"
          option-label="name"
          option-value="id"
          size="small"
          aria-label="Move from"
          class="move-intro__source"
        />
        <span>to:</span>
      </template>
    </div>
    <div v-else class="move-intro">
      <span>
        Move <strong>{{ objects.length }} objects</strong>
        <template v-if="sharedSource">
          from <strong>{{ sharedSource.name }}</strong>
        </template>
        to:
      </span>
    </div>
  </ContainerPickerDialog>
</template>

<style scoped>
.move-intro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.move-intro__empty {
  color: var(--p-text-muted-color);
}

.move-intro__source {
  min-width: 10rem;
}
</style>
