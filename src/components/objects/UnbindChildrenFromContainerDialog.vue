<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import { useObjectChildren, useUnbindObjectChild } from '@/queries/useObjectQueries'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'

const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const { mutateAsync: unbindAsync, isPending } = useUnbindObjectChild()

// The detail object's `children` are bare IDs, which adaptBaseObject does not preserve.
const objectId = computed(() => props.object?.id ?? null)
const { data: childObjects, isLoading } = useObjectChildren(objectId)
const children = computed(() => childObjects.value ?? [])

const selectedChildIds = ref(new Set())

function toggleChild(id) {
  const next = new Set(selectedChildIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedChildIds.value = next
}

async function onConfirm() {
  if (selectedChildIds.value.size === 0) return
  const parentId = props.object.id
  try {
    await Promise.all(
      [...selectedChildIds.value].map((childId) => unbindAsync({ parentId, childId })),
    )
    const n = selectedChildIds.value.size
    toast.add({
      severity: 'success',
      summary: n === 1 ? 'Object unbound' : `${n} objects unbound`,
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
    header="Unbind Objects from Container"
    modal
    :style="{ width: '460px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="unbind-body">
      <p class="unbind-hint">
        Select objects to remove from
        <strong>{{ object?.name }}</strong
        >:
      </p>

      <div v-if="isLoading" class="unbind-list">
        <Skeleton v-for="i in 3" :key="i" height="2rem" class="mb-1" />
      </div>

      <div v-else-if="children.length === 0" class="unbind-empty">
        This container has no child objects.
      </div>

      <div v-else class="unbind-list">
        <label
          v-for="child in children"
          :key="child.id"
          class="unbind-item"
          :class="{ 'unbind-item--selected': selectedChildIds.has(child.id) }"
        >
          <Checkbox
            :model-value="selectedChildIds.has(child.id)"
            :binary="true"
            @update:model-value="() => toggleChild(child.id)"
          />
          <ObjectIcon :object="child" :size="16" class="unbind-item-icon" />
          <span>{{ child.name }}</span>
        </label>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        :label="selectedChildIds.size > 1 ? `Unbind (${selectedChildIds.size})` : 'Unbind'"
        severity="danger"
        icon="pi pi-times"
        :disabled="selectedChildIds.size === 0 || children.length === 0"
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
