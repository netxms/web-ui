<script setup>
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import { useObjectIconStore } from '@/stores/objectIconStore'
import { useUpdateObjectCategory } from '@/queries/useObjectCategoryQueries'
import { configTarget } from '@/utils/routeTargets'

// Shown while a category's draft images are previewed; nothing reaches the server until Apply.
const store = useObjectIconStore()
const toast = useToast()
const { mutate: updateCategory, isPending } = useUpdateObjectCategory()

const categoriesTarget = configTarget('object-categories')

function apply() {
  const draft = store.preview
  if (!draft) return
  updateCategory(
    {
      categoryId: draft.categoryId,
      data: { name: draft.name, iconImageId: draft.iconImageId, mapImageId: draft.mapImageId },
    },
    {
      onSuccess: () => {
        store.stopPreview()
        toast.add({
          severity: 'success',
          summary: 'Icons applied',
          detail: `Category "${draft.name}" now uses the previewed images.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Could not apply icons',
          detail: err?.message ?? 'Failed to update the category.',
          life: 5000,
        })
      },
    },
  )
}
</script>

<template>
  <div v-if="store.preview" class="icon-preview-bar" role="status">
    <i class="pi pi-eye icon-preview-bar__icon" aria-hidden="true" />
    <span class="icon-preview-bar__text">
      Previewing icons for category <strong>{{ store.preview.name }}</strong
      >. Only you see them, in this tab, until you apply or discard them.
      <AppLink :to="categoriesTarget" class="icon-preview-bar__link">Edit the category</AppLink>
    </span>
    <span class="icon-preview-bar__actions">
      <Button
        label="Discard"
        text
        size="small"
        severity="secondary"
        :disabled="isPending"
        @click="store.stopPreview"
      />
      <Button label="Apply" icon="pi pi-check" size="small" :loading="isPending" @click="apply" />
    </span>
  </div>
</template>

<style scoped>
.icon-preview-bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--p-text-color);
  background: color-mix(in srgb, var(--p-primary-color) 10%, var(--p-surface-card));
  border-top: 1px solid color-mix(in srgb, var(--p-primary-color) 35%, var(--p-surface-border));
}

.icon-preview-bar__icon {
  color: var(--p-primary-color);
}

.icon-preview-bar__text {
  flex: 1;
  min-width: 0;
}

.icon-preview-bar__link {
  margin-inline-start: 0.375rem;
  color: var(--p-primary-color);
}

.icon-preview-bar__actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
