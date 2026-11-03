<script setup>
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import LibraryImage from '@/components/image-library/LibraryImage.vue'

const props = defineProps({
  /** null for the empty state. */
  image: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['edit', 'delete'])

const toast = useToast()

function copyGuid() {
  navigator.clipboard.writeText(props.image.id).then(() => {
    toast.add({ severity: 'success', summary: 'GUID copied', life: 1500 })
  })
}
</script>

<template>
  <div class="image-preview-panel">
    <div v-if="!image" class="empty-state">
      <i class="pi pi-images empty-icon" />
      <span class="empty-text">Select an image to preview</span>
    </div>

    <template v-else>
      <div class="preview-header">
        <span class="preview-title">{{ image.name }}</span>
        <Tag :value="image.category" severity="secondary" class="category-tag" />
      </div>

      <div class="preview-image-area">
        <LibraryImage eager :guid="image.id" :alt="image.name" class="preview-img" />
      </div>

      <div class="preview-metadata">
        <div class="meta-row">
          <span class="meta-label">Name</span>
          <span class="meta-value">{{ image.name }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Category</span>
          <span class="meta-value">{{ image.category }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">MIME Type</span>
          <span class="meta-value meta-mono">{{ image.mimeType }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">GUID</span>
          <span class="meta-value meta-mono meta-guid">
            {{ image.id }}
            <Button
              v-tooltip.top="'Copy GUID'"
              aria-label="Copy GUID"
              icon="pi pi-copy"
              size="small"
              text
              rounded
              severity="secondary"
              class="copy-btn"
              @click="copyGuid"
            />
          </span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Protected</span>
          <span class="meta-value">
            <Tag v-if="image.protected" value="System image" severity="warn" icon="pi pi-lock" />
            <span v-else class="meta-muted">No</span>
          </span>
        </div>
      </div>

      <div class="preview-actions">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          severity="secondary"
          size="small"
          :disabled="image.protected"
          @click="emit('edit', image)"
        />
        <Button
          v-tooltip.top="image.protected ? 'System images cannot be deleted' : undefined"
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          :disabled="image.protected"
          @click="emit('delete', image)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.image-preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--p-surface-ground);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--p-text-muted-color);
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.25;
}

.empty-text {
  font-size: 0.9375rem;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.preview-title {
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.category-tag {
  flex-shrink: 0;
  font-size: 0.6875rem;
}

.preview-image-area {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
  padding: 1.5rem;
  min-height: 220px;
  max-height: 340px;
  flex-shrink: 0;
}

.preview-img {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
  border-radius: 6px;
}

.preview-metadata {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
  background: var(--p-surface-card);
}

.meta-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.8125rem;
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-label {
  width: 5.5rem;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  padding-top: 0.125rem;
}

.meta-value {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.meta-mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.meta-guid {
  color: var(--p-text-muted-color);
}

.meta-muted {
  color: var(--p-text-muted-color);
}

.copy-btn {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.preview-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}
</style>
