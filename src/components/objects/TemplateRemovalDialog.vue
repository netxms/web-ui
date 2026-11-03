<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import RadioButton from 'primevue/radiobutton'

const props = defineProps({
  visible: { type: Boolean, required: true },
  target: { type: Object, default: null },
  isPending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'confirm'])

const removeDci = ref(true)

watch(
  () => props.visible,
  (visible) => {
    if (visible) removeDci.value = true
  },
)

function onCancel() {
  emit('update:visible', false)
}

function onConfirm() {
  emit('confirm', removeDci.value)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Remove Target"
    modal
    :style="{ width: '480px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="removal-body">
      <p class="removal-hint">
        Remove <strong>{{ target?.name }}</strong> from this template's targets?
      </p>

      <div class="removal-options">
        <label class="radio-row">
          <RadioButton autofocus v-model="removeDci" :value="true" input-id="removal-remove-dci" />
          <span>Remove DCIs from node</span>
        </label>
        <label class="radio-row">
          <RadioButton v-model="removeDci" :value="false" input-id="removal-unbind-dci" />
          <span>Unbind DCIs from template (keep collected data)</span>
        </label>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        label="Remove"
        icon="pi pi-times"
        severity="danger"
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
