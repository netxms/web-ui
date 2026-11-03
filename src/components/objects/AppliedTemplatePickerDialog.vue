<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import ProgressSpinner from 'primevue/progressspinner'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { getStatusInfo } from '@/utils/objectUtils'

// Lists only templates the targets already carry (legacy DIRECT_SUPERORDINATES). Tree nodes
// carry no parents, so each target's `parents` is fetched, then their classes.
const props = defineProps({
  visible: { type: Boolean, required: true },
  targets: { type: Array, default: () => [] },
  isPending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'confirm'])

// The dialog stays mounted for the life of the perspective.
const targetIds = computed(() => (props.visible ? props.targets.map((o) => o.id) : []))
const { objectsById: targetsById } = useObjectsByIds(targetIds)

const parentIds = computed(() => {
  const ids = new Set()
  for (const id of targetIds.value) {
    for (const parentId of targetsById.value.get(id)?.parents ?? []) ids.add(parentId)
  }
  return [...ids]
})
const { objectsById: parentsById } = useObjectsByIds(parentIds)

const candidates = computed(() =>
  parentIds.value
    .map((id) => parentsById.value.get(id))
    .filter((object) => object?.class === 'Template'),
)

const resolving = computed(
  () => targetIds.value.length > 0 && targetsById.value.size < targetIds.value.length,
)

const selectedIds = ref([])
const removeDci = ref(true)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    selectedIds.value = []
    removeDci.value = true
  },
)

const targetSummary = computed(() =>
  props.targets.length === 1 ? props.targets[0]?.name : `${props.targets.length} objects`,
)

function onCancel() {
  emit('update:visible', false)
}

function onConfirm() {
  if (!selectedIds.value.length) return
  emit('confirm', { templateIds: [...selectedIds.value], removeDci: removeDci.value })
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Remove Template"
    modal
    :style="{ width: '520px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="removal-body">
      <p class="removal-hint">
        Remove templates from <strong>{{ targetSummary }}</strong
        >:
      </p>

      <div v-if="resolving" class="removal-loading">
        <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
      </div>
      <p v-else-if="candidates.length === 0" class="removal-empty">
        No templates are applied to the selected
        {{ targets.length === 1 ? 'object' : 'objects' }}.
      </p>

      <template v-else>
        <div class="template-list">
          <label v-for="template in candidates" :key="template.id" class="template-row">
            <Checkbox v-model="selectedIds" :value="template.id" />
            <span
              class="template-status"
              :style="{ background: getStatusInfo(template.status).color }"
            />
            <span class="template-name">{{ template.name }}</span>
          </label>
        </div>

        <div class="removal-options">
          <label class="radio-row">
            <RadioButton
              autofocus
              v-model="removeDci"
              :value="true"
              input-id="applied-remove-dci"
            />
            <span>Remove DCIs from node</span>
          </label>
          <label class="radio-row">
            <RadioButton v-model="removeDci" :value="false" input-id="applied-unbind-dci" />
            <span>Unbind DCIs from template (keep collected data)</span>
          </label>
        </div>
      </template>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        label="Remove"
        icon="pi pi-times"
        severity="danger"
        :disabled="selectedIds.length === 0"
        :loading="isPending"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.removal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.removal-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.removal-empty {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.removal-loading {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  padding: 0.5rem;
}

.template-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem;
  font-size: 0.875rem;
  cursor: pointer;
  border-radius: 4px;
}

.template-row:hover {
  background: var(--p-surface-hover);
}

.template-status {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.template-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.removal-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
