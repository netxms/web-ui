<script setup>
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'

defineProps({
  visible: { type: Boolean, default: false },
  header: { type: String, required: true },
  width: { type: String, default: '420px' },
  isPending: { type: Boolean, default: false },
  isValid: { type: Boolean, default: true },
})

defineEmits(['update:visible', 'create'])
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    :modal="true"
    :closable="true"
    :style="{ width }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="create-dialog-form">
      <slot />
    </div>

    <template #footer>
      <div v-if="$slots['footer-extra']" class="footer-row">
        <slot name="footer-extra" />
        <div class="footer-actions">
          <Button
            label="Cancel"
            text
            severity="secondary"
            :disabled="isPending"
            @click="$emit('update:visible', false)"
          />
          <Button
            label="Create"
            :disabled="!isValid"
            :loading="isPending"
            @click="$emit('create')"
          />
        </div>
      </div>
      <template v-else>
        <Button
          label="Cancel"
          text
          severity="secondary"
          :disabled="isPending"
          @click="$emit('update:visible', false)"
        />
        <Button label="Create" :disabled="!isValid" :loading="isPending" @click="$emit('create')" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.create-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 1rem;
}

.footer-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
