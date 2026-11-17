<script setup>
// Names a layer: "New layer" puts the selected elements on it, "Rename" moves a layer's elements
// to the new name (an existing name merges the two). A layer exists only while an element uses it.
import { computed, nextTick, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'

const props = defineProps({
  visible: { type: Boolean, required: true },
  title: { type: String, default: 'New Layer' },
  confirmLabel: { type: String, default: 'Create' },
  initialName: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'create'])

const name = ref('')
const input = ref(null)

watch(
  () => props.visible,
  async (open) => {
    if (!open) return
    name.value = props.initialName
    await nextTick()
    input.value?.$el?.select?.()
  },
)

const trimmed = computed(() => name.value.trim())
const unchanged = computed(() => trimmed.value === props.initialName)

function onConfirm() {
  if (!trimmed.value || unchanged.value) return
  emit('create', trimmed.value)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: '420px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="new-layer-body">
      <label class="new-layer-label" for="new-map-layer-name">Layer name</label>
      <InputText
        id="new-map-layer-name"
        ref="input"
        v-model="name"
        autofocus
        class="new-layer-input"
        @keyup.enter="onConfirm"
      />
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button
        :label="confirmLabel"
        icon="pi pi-check"
        :disabled="!trimmed || unchanged"
        @click="onConfirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.new-layer-body {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.new-layer-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.new-layer-input {
  width: 100%;
}
</style>
