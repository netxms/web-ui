<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { useUpdateObjectProperties } from '@/queries/useObjectQueries'

/** Opened through the `object:rename` document event. */
const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const { mutateAsync: updateAsync, isPending } = useUpdateObjectProperties()

const name = ref('')
const input = ref(null)

watch(
  () => props.visible,
  async (open) => {
    if (!open) return
    name.value = props.object?.name ?? ''
    await nextTick()
    // Select rather than just focus: renaming usually replaces the whole name.
    input.value?.$el?.select?.()
  },
)

const trimmed = computed(() => name.value.trim())
const unchanged = computed(() => trimmed.value === (props.object?.name ?? ''))

async function onConfirm() {
  if (!props.object || trimmed.value.length === 0 || unchanged.value) return
  try {
    await updateAsync({ id: props.object.id, payload: { name: trimmed.value } })
    toast.add({ severity: 'success', summary: 'Object renamed', life: 2500 })
    emit('update:visible', false)
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Rename failed',
      detail: error?.message,
      life: 3000,
    })
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Rename Object"
    modal
    :style="{ width: '420px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="rename-body">
      <label class="rename-label" for="rename-object-name">Name</label>
      <InputText
        id="rename-object-name"
        ref="input"
        v-model="name"
        autofocus
        class="rename-input"
        @keyup.enter="onConfirm"
      />
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button
        label="Rename"
        icon="pi pi-pencil"
        :disabled="trimmed.length === 0 || unchanged"
        :loading="isPending"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.rename-body {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.rename-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.rename-input {
  width: 100%;
}
</style>
