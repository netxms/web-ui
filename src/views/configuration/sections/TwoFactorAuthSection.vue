<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import TwoFactorMethodCard from '@/components/two-factor/TwoFactorMethodCard.vue'
import TwoFactorMethodDialog from '@/components/two-factor/TwoFactorMethodDialog.vue'
import {
  useTwoFactorDrivers,
  useTwoFactorMethods,
  useCreateTwoFactorMethod,
  useUpdateTwoFactorMethod,
  useDeleteTwoFactorMethod,
} from '@/queries/useTwoFactorQueries'
import { useNotificationChannels } from '@/queries/useNotificationChannelQueries'

const confirm = useConfirm()
const toast = useToast()

const { data: driversData } = useTwoFactorDrivers()
const drivers = computed(() => driversData.value ?? [])

const { data: channelsData } = useNotificationChannels()
const channels = computed(() => channelsData.value ?? [])

const { data: methodsData, isLoading, isFetching, isError, error, refetch } = useTwoFactorMethods()
const methods = computed(() => methodsData.value ?? [])

const dialogVisible = ref(false)
const editingMethod = ref(null)
const dialogError = ref(null)

function openCreate() {
  editingMethod.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(method) {
  editingMethod.value = method
  dialogError.value = null
  dialogVisible.value = true
}

const { mutate: createMethod, isPending: isCreating } = useCreateTwoFactorMethod()
const { mutate: updateMethod, isPending: isUpdating } = useUpdateTwoFactorMethod()
const { mutate: deleteMethod } = useDeleteTwoFactorMethod()

const isSaving = computed(() => isCreating.value || isUpdating.value)

function onDialogSave(payload) {
  dialogError.value = null

  if (editingMethod.value) {
    updateMethod(
      { name: editingMethod.value.name, data: payload },
      {
        onSuccess: () => {
          dialogVisible.value = false
        },
        onError: (err) => {
          dialogError.value = err.message ?? 'Failed to update method.'
        },
      },
    )
  } else {
    createMethod(payload, {
      onSuccess: () => {
        dialogVisible.value = false
      },
      onError: (err) => {
        dialogError.value =
          err.status === 409
            ? `A method named "${payload.name}" already exists.`
            : (err.message ?? 'Failed to create method.')
      },
    })
  }
}

function confirmDelete(method) {
  confirm.require({
    message: `Delete method "${method.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteMethod(method.name, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Method "${method.name}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete method.',
            life: 5000,
          })
        },
      })
    },
  })
}
</script>

<template>
  <div class="twofa-section">
    <SectionHeader title="Two-Factor Authentication" icon="pi pi-shield">
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
          label="Add Method"
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
        <Skeleton v-for="i in 3" :key="i" height="9rem" border-radius="0.5rem" />
      </div>

      <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

      <div v-else-if="methods.length === 0" class="empty-state">
        <i class="pi pi-shield empty-icon" />
        <p class="empty-title">No authentication methods configured</p>
        <p class="empty-subtitle">
          Add a two-factor authentication method to strengthen account security.
        </p>
        <Button label="Add First Method" icon="pi pi-plus" severity="primary" @click="openCreate" />
      </div>

      <div v-else class="card-grid">
        <TwoFactorMethodCard
          v-for="method in methods"
          :key="method.name"
          :method="method"
          @edit="openEdit"
          @delete="confirmDelete"
        />
      </div>
    </div>
  </div>

  <TwoFactorMethodDialog
    v-model:visible="dialogVisible"
    :method="editingMethod"
    :drivers="drivers"
    :channels="channels"
    :saving="isSaving"
    :error="dialogError"
    @save="onDialogSave"
  />
</template>

<style scoped>
.twofa-section {
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
