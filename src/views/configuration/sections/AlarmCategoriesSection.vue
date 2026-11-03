<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import AlarmCategoryCard from '@/components/alarm-categories/AlarmCategoryCard.vue'
import AlarmCategoryDialog from '@/components/alarm-categories/AlarmCategoryDialog.vue'
import {
  useAlarmCategories,
  useCreateAlarmCategory,
  useUpdateAlarmCategory,
  useDeleteAlarmCategory,
} from '@/queries/useAlarmCategoryQueries'

const confirm = useConfirm()
const toast = useToast()

const {
  data: categoriesData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useAlarmCategories()

const categories = computed(() => categoriesData.value ?? [])

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

const { mutate: createCategory, isPending: isCreating } = useCreateAlarmCategory()
const { mutate: updateCategory, isPending: isUpdating } = useUpdateAlarmCategory()
const { mutate: deleteCategory } = useDeleteAlarmCategory()

const isSaving = computed(() => isCreating.value || isUpdating.value)

function onDialogSave(payload) {
  dialogError.value = null

  if (editingCategory.value) {
    updateCategory(
      { categoryId: editingCategory.value.id, data: payload },
      {
        onSuccess: () => {
          dialogVisible.value = false
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
            toast.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `Category "${category.name}" deleted.`,
              life: 3000,
            })
          },
          onError: (err) => {
            if (err.status === 409) {
              toast.add({
                severity: 'error',
                summary: 'Cannot Delete',
                detail: `"${category.name}" is used by one or more EPP rules and cannot be deleted.`,
                life: 5000,
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
  <div class="alarm-categories-section">
    <SectionHeader title="Alarm Categories" icon="pi pi-tag">
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
        <Skeleton v-for="i in 6" :key="i" height="5rem" border-radius="0.5rem" />
      </div>

      <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

      <div v-else-if="categories.length === 0" class="empty-state">
        <i class="pi pi-tag empty-icon" />
        <p class="empty-title">No alarm categories defined</p>
        <p class="empty-subtitle">
          Alarm categories let you classify alarms for filtering and reporting in the event
          processing policy.
        </p>
        <Button
          label="Add First Category"
          icon="pi pi-plus"
          severity="primary"
          @click="openCreate"
        />
      </div>

      <div v-else class="card-grid">
        <AlarmCategoryCard
          v-for="category in categories"
          :key="category.id"
          :category="category"
          @edit="openEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>
  </div>

  <AlarmCategoryDialog
    v-model:visible="dialogVisible"
    :category="editingCategory"
    :saving="isSaving"
    :error="dialogError"
    @save="onDialogSave"
  />
</template>

<style scoped>
.alarm-categories-section {
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
