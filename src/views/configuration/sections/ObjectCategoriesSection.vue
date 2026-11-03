<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ObjectCategoryCard from '@/components/object-categories/ObjectCategoryCard.vue'
import ObjectCategoryDialog from '@/components/object-categories/ObjectCategoryDialog.vue'
import {
  useObjectCategories,
  useCreateObjectCategory,
  useUpdateObjectCategory,
  useDeleteObjectCategory,
} from '@/queries/useObjectCategoryQueries'
import { useImageLibrary } from '@/queries/useImageLibraryQueries'
import { useObjectIconStore } from '@/stores/objectIconStore'

const confirm = useConfirm()
const toast = useToast()
const iconStore = useObjectIconStore()

const {
  data: categoriesData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useObjectCategories()
const { data: imagesData } = useImageLibrary()

const categories = computed(() => categoriesData.value ?? [])
const images = computed(() => imagesData.value ?? [])

function findImage(id) {
  return id ? (images.value.find((img) => img.id === id) ?? null) : null
}

/** Set, but not in the library (deleted since). Unknown until the library list is in. */
function isMissing(id) {
  return !!id && imagesData.value != null && !findImage(id)
}

const dialogVisible = ref(false)
const editingCategory = ref(null)
const dialogError = ref(null)

function openCreate() {
  editingCategory.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(category) {
  editingCategory.value = category
  dialogError.value = null
  dialogVisible.value = true
}

const { mutate: createCategory, isPending: isCreating } = useCreateObjectCategory()
const { mutate: updateCategory, isPending: isUpdating } = useUpdateObjectCategory()
const { mutate: deleteCategory } = useDeleteObjectCategory()

const isSaving = computed(() => isCreating.value || isUpdating.value)

function onDialogSave(payload) {
  dialogError.value = null

  if (editingCategory.value) {
    const categoryId = editingCategory.value.id
    updateCategory(
      { categoryId, data: payload },
      {
        onSuccess: () => {
          dialogVisible.value = false
          if (iconStore.preview?.categoryId === categoryId) iconStore.stopPreview()
        },
        onError: (err) => {
          dialogError.value = err.message ?? 'Failed to update category.'
        },
      },
    )
  } else {
    createCategory(payload, {
      onSuccess: () => {
        dialogVisible.value = false
      },
      onError: (err) => {
        dialogError.value = err.message ?? 'Failed to create category.'
      },
    })
  }
}

function confirmDelete(category) {
  // A deleted category has nothing left to preview, and Apply would only fail.
  const dropPreview = () => {
    if (iconStore.preview?.categoryId === category.id) iconStore.stopPreview()
  }
  confirm.require({
    message: `Delete category "${category.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteCategory(
        { categoryId: category.id },
        {
          onSuccess: () => {
            dropPreview()
            toast.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `Category "${category.name}" deleted.`,
              life: 3000,
            })
          },
          onError: (err) => {
            if (err.status === 409) {
              confirm.require({
                message: `"${category.name}" is assigned to one or more objects. Force deleting will reset those objects to no category. Proceed?`,
                header: 'Category In Use',
                icon: 'pi pi-exclamation-triangle',
                rejectLabel: 'Cancel',
                acceptLabel: 'Force Delete',
                acceptClass: 'p-button-danger',
                accept: () => {
                  deleteCategory(
                    { categoryId: category.id, force: true },
                    {
                      onSuccess: () => {
                        dropPreview()
                        toast.add({
                          severity: 'success',
                          summary: 'Deleted',
                          detail: `Category "${category.name}" deleted.`,
                          life: 3000,
                        })
                      },
                      onError: (err2) => {
                        toast.add({
                          severity: 'error',
                          summary: 'Delete Failed',
                          detail: err2.message ?? 'Failed to delete category.',
                          life: 5000,
                        })
                      },
                    },
                  )
                },
              })
            } else {
              toast.add({
                severity: 'error',
                summary: 'Delete Failed',
                detail: err.message ?? 'Failed to delete category.',
                life: 5000,
              })
            }
          },
        },
      )
    },
  })
}
</script>

<template>
  <div class="object-categories-section">
    <SectionHeader title="Object Categories" icon="pi pi-th-large">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          label="Add Category"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreate"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-content">
      <div v-if="isLoading" class="card-grid">
        <Skeleton v-for="i in 6" :key="i" height="8.5rem" border-radius="0.5rem" />
      </div>

      <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

      <div v-else-if="categories.length === 0" class="empty-state">
        <i class="pi pi-th-large empty-icon" />
        <p class="empty-title">No object categories defined</p>
        <p class="empty-subtitle">
          Categories let you assign icons and map images to object types like routers or switches.
        </p>
        <Button
          label="Add First Category"
          icon="pi pi-plus"
          severity="primary"
          @click="openCreate"
        />
      </div>

      <div v-else class="card-grid">
        <ObjectCategoryCard
          v-for="category in categories"
          :key="category.id"
          :category="category"
          :icon-image="findImage(category.iconImageId)"
          :map-image="findImage(category.mapImageId)"
          :icon-missing="isMissing(category.iconImageId)"
          :map-missing="isMissing(category.mapImageId)"
          @edit="openEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>
  </div>

  <ObjectCategoryDialog
    v-model:visible="dialogVisible"
    :category="editingCategory"
    :saving="isSaving"
    :error="dialogError"
    @save="onDialogSave"
  />
</template>

<style scoped>
.object-categories-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  align-content: start;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 4rem 2rem;
  text-align: center;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 2.5rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.5rem;
}

.empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.empty-subtitle {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  max-width: 28rem;
}
</style>
