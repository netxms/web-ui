<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'

defineProps({
  visible: { type: Boolean, default: false },
  sql: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const copied = ref(false)

async function copy(sql) {
  try {
    await navigator.clipboard.writeText(sql)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    toast.add({
      severity: 'warn',
      summary: 'Could not copy',
      detail: 'Clipboard access was denied by the browser.',
      life: 4000,
    })
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Query SQL"
    :style="{ width: '52rem', maxWidth: '95vw' }"
    @update:visible="(v) => emit('update:visible', v)"
  >
    <p class="sql-note">
      Statement in the syntax of the server's database engine. It already includes your object
      access constraints and the row limit used for paging.
    </p>

    <p v-if="error" class="sql-error">{{ error.message ?? 'Failed to build the statement' }}</p>
    <p v-else-if="loading" class="sql-note">Building statement...</p>
    <pre v-else class="sql-text">{{ sql }}</pre>

    <template #footer>
      <Button
        :label="copied ? 'Copied' : 'Copy'"
        :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
        severity="secondary"
        :disabled="!sql"
        @click="copy(sql)"
      />
      <Button label="Close" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<style scoped>
.sql-note {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.sql-error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-red-500);
}

.sql-text {
  margin: 0;
  padding: 0.75rem;
  max-height: 24rem;
  overflow: auto;
  border-radius: 4px;
  background: var(--p-surface-ground);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
