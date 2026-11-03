<script setup>
import Button from 'primevue/button'

const props = defineProps({
  sshKey: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'delete', 'copy'])

const publicKeyPreview = props.sshKey.publicKey?.slice(0, 48) ?? null
</script>

<template>
  <div class="ssh-key-card">
    <div class="card-header">
      <span class="key-chip">SSH Key</span>
    </div>

    <div class="card-body">
      <p class="key-name">{{ sshKey.name }}</p>
      <p v-if="publicKeyPreview" class="key-preview">{{ publicKeyPreview }}…</p>
      <p v-else class="key-preview key-preview--empty">No public key available</p>
    </div>

    <div class="card-footer">
      <div class="footer-left">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          text
          size="small"
          severity="secondary"
          @click="emit('edit', sshKey)"
        />
        <Button
          v-if="sshKey.publicKey"
          label="Copy Key"
          icon="pi pi-copy"
          text
          size="small"
          severity="secondary"
          @click="emit('copy', sshKey)"
        />
      </div>
      <Button
        label="Delete"
        icon="pi pi-trash"
        text
        size="small"
        severity="danger"
        @click="emit('delete', sshKey)"
      />
    </div>
  </div>
</template>

<style scoped>
.ssh-key-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.ssh-key-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.card-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.875rem 0;
}

.key-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--p-teal-100);
  color: var(--p-teal-700);
}

.card-body {
  flex: 1;
  padding: 0.625rem 0.875rem 0.5rem;
}

.key-name {
  margin: 0 0 0.25rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.key-preview {
  margin: 0;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.key-preview--empty {
  font-style: italic;
  font-family: inherit;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
