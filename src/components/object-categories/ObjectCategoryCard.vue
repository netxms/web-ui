<script setup>
import Button from 'primevue/button'
import LibraryImage from '@/components/image-library/LibraryImage.vue'

defineProps({
  category: {
    type: Object,
    required: true,
  },
  iconImage: {
    type: Object,
    default: null,
  },
  mapImage: {
    type: Object,
    default: null,
  },
  /** The server deletes library images without checking who uses them. */
  iconMissing: { type: Boolean, default: false },
  mapMissing: { type: Boolean, default: false },
})

const MISSING_TOOLTIP =
  'This image is no longer in the image library. Objects in this category show the standard icon.'

const emit = defineEmits(['edit', 'delete'])
</script>

<template>
  <div class="object-category-card">
    <div class="card-header">
      <span class="category-name">{{ category.name }}</span>
      <div class="card-actions">
        <Button
          label="Edit"
          icon="pi pi-pencil"
          text
          size="small"
          severity="secondary"
          @click="emit('edit', category)"
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          text
          size="small"
          severity="danger"
          @click="emit('delete', category)"
        />
      </div>
    </div>

    <div class="card-thumbnails">
      <div class="thumbnail-slot">
        <div class="thumbnail-frame">
          <LibraryImage
            v-if="iconImage"
            :guid="iconImage.id"
            :alt="iconImage.name"
            class="thumbnail-img"
          />
          <i
            v-else-if="iconMissing"
            v-tooltip.top="MISSING_TOOLTIP"
            class="pi pi-exclamation-triangle thumbnail-missing-icon"
          />
          <i v-else class="pi pi-image thumbnail-placeholder-icon" />
        </div>
        <span class="thumbnail-label">{{ iconMissing ? 'Icon (missing)' : 'Icon' }}</span>
      </div>

      <div class="thumbnail-divider" />

      <div class="thumbnail-slot">
        <div class="thumbnail-frame">
          <LibraryImage
            v-if="mapImage"
            :guid="mapImage.id"
            :alt="mapImage.name"
            class="thumbnail-img"
          />
          <i
            v-else-if="mapMissing"
            v-tooltip.top="MISSING_TOOLTIP"
            class="pi pi-exclamation-triangle thumbnail-missing-icon"
          />
          <i v-else class="pi pi-map thumbnail-placeholder-icon" />
        </div>
        <span class="thumbnail-label">{{ mapMissing ? 'Map Image (missing)' : 'Map Image' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.object-category-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.object-category-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.5rem 0.625rem 0.875rem;
}

.category-name {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.card-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.card-thumbnails {
  display: flex;
  border-top: 1px solid var(--p-surface-border);
}

.thumbnail-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.75rem 0.5rem;
}

.thumbnail-divider {
  width: 1px;
  background: var(--p-surface-border);
  align-self: stretch;
}

.thumbnail-frame {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  background: var(--p-surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumbnail-placeholder-icon {
  font-size: 1.75rem;
  color: var(--p-text-muted-color);
}

.thumbnail-missing-icon {
  font-size: 1.5rem;
  color: var(--netxms-status-minor);
}

.thumbnail-label {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  text-align: center;
}
</style>
