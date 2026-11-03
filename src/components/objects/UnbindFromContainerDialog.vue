<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import { useObject, useObjectsByIds, useUnbindObjectChild } from '@/queries/useObjectQueries'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'

const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const { mutateAsync: unbindAsync, isPending } = useUnbindObjectChild()

const CONTAINER_LIKE = new Set(['Container', 'Collector', 'ServiceRoot'])

// Tree nodes carry no parent IDs; the full object does.
const objectId = computed(() => props.object?.id ?? null)
const { data: fullObject, isLoading: isObjectLoading } = useObject(objectId)

const parentIds = computed(() => fullObject.value?.parents ?? [])
const { objectsById } = useObjectsByIds(parentIds)

const containerParents = computed(() => {
  const map = objectsById.value
  return parentIds.value.map((id) => map.get(id)).filter((o) => o && CONTAINER_LIKE.has(o.class))
})

const isLoading = computed(
  () =>
    isObjectLoading.value ||
    (parentIds.value.length > 0 && objectsById.value.size < parentIds.value.length),
)

const selectedParentIds = ref(new Set())

watch(containerParents, (parents) => {
  if (parents.length === 1 && selectedParentIds.value.size === 0) {
    selectedParentIds.value = new Set([parents[0].id])
  }
})

function toggleParent(id) {
  const next = new Set(selectedParentIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedParentIds.value = next
}

async function onConfirm() {
  if (selectedParentIds.value.size === 0) return
  const childId = props.object.id
  try {
    await Promise.all(
      [...selectedParentIds.value].map((parentId) => unbindAsync({ parentId, childId })),
    )
    const n = selectedParentIds.value.size
    toast.add({
      severity: 'success',
      summary: n === 1 ? 'Object unbound' : `Unbound from ${n} containers`,
      life: 2500,
    })
    emit('update:visible', false)
  } catch {
    toast.add({ severity: 'error', summary: 'Unbind failed', life: 3000 })
  }
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Unbind from Container"
    modal
    :style="{ width: '460px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="unbind-body">
      <p class="unbind-hint">
        Select the container(s) to remove
        <strong>{{ object?.name }}</strong>
        from:
      </p>

      <div v-if="isLoading" class="unbind-list">
        <Skeleton v-for="i in 3" :key="i" height="2rem" class="mb-1" />
      </div>

      <div v-else-if="containerParents.length === 0" class="unbind-empty">
        This object is not bound to any containers.
      </div>

      <div v-else class="unbind-list">
        <label
          v-for="parent in containerParents"
          :key="parent.id"
          class="unbind-item"
          :class="{ 'unbind-item--selected': selectedParentIds.has(parent.id) }"
        >
          <Checkbox
            :model-value="selectedParentIds.has(parent.id)"
            :binary="true"
            @update:model-value="() => toggleParent(parent.id)"
          />
          <ObjectIcon :object="parent" :size="16" class="unbind-item-icon" />
          <span>{{ parent.name }}</span>
        </label>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        :label="selectedParentIds.size > 1 ? `Unbind (${selectedParentIds.size})` : 'Unbind'"
        severity="danger"
        icon="pi pi-times"
        :disabled="selectedParentIds.size === 0 || containerParents.length === 0"
        :loading="isPending"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.unbind-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.unbind-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.unbind-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.unbind-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  border: 1px solid transparent;
  transition: background 0.15s;
  user-select: none;
}

.unbind-item:hover {
  background: var(--p-surface-hover);
}

.unbind-item--selected {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50, var(--p-surface-100));
}

.unbind-item-icon {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.unbind-empty {
  padding: 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}
</style>
