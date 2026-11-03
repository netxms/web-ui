<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SshKeyCard from '@/components/ssh-keys/SshKeyCard.vue'
import SshKeyDialog from '@/components/ssh-keys/SshKeyDialog.vue'
import {
  useSshKeys,
  useCreateSshKey,
  useUpdateSshKey,
  useDeleteSshKey,
} from '@/queries/useSshKeyQueries'

const confirm = useConfirm()
const toast = useToast()

const { data: keysData, isLoading, isFetching, isError, error, refetch } = useSshKeys()
const keys = computed(() => keysData.value ?? [])

const dialogVisible = ref(false)
const editingKey = ref(null)
const dialogError = ref(null)

function openCreate() {
  editingKey.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(key) {
  editingKey.value = key
  dialogError.value = null
  dialogVisible.value = true
}

const { mutate: createKey, isPending: isCreating } = useCreateSshKey()
const { mutate: updateKey, isPending: isUpdating } = useUpdateSshKey()
const { mutate: deleteKey } = useDeleteSshKey()

const isSaving = computed(() => isCreating.value || isUpdating.value)

function onDialogSave(payload) {
  dialogError.value = null

  if (editingKey.value) {
    updateKey(
      { keyId: editingKey.value.id, data: payload },
      {
        onSuccess: () => {
          dialogVisible.value = false
        },
        onError: (err) => {
          dialogError.value = err.message ?? 'Failed to update SSH key.'
        },
      },
    )
  } else {
    createKey(payload, {
      onSuccess: () => {
        dialogVisible.value = false
      },
      onError: (err) => {
        dialogError.value = err.message ?? 'Failed to create SSH key.'
      },
    })
  }
}

function confirmDelete(key) {
  confirm.require({
    message: `Delete SSH key "${key.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteKey(
        { keyId: key.id },
        {
          onSuccess: () => {
            toast.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `SSH key "${key.name}" deleted.`,
              life: 3000,
            })
          },
          onError: (err) => {
            if (err.status === 409) {
              confirmForceDelete(key, err.data)
            } else {
              toast.add({
                severity: 'error',
                summary: 'Delete Failed',
                detail: err.message ?? 'Failed to delete SSH key.',
                life: 5000,
              })
            }
          },
        },
      )
    },
  })
}

function confirmForceDelete(key, errorData) {
  const nodeCount = errorData?.nodesInUse?.length ?? 0
  const nodeText = nodeCount === 1 ? '1 node' : `${nodeCount} nodes`
  confirm.require({
    message: `Key "${key.name}" is in use by ${nodeText}. Force delete anyway?`,
    header: 'Key In Use',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Force Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteKey(
        { keyId: key.id, force: true },
        {
          onSuccess: () => {
            toast.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `SSH key "${key.name}" deleted.`,
              life: 3000,
            })
          },
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? 'Failed to delete SSH key.',
              life: 5000,
            })
          },
        },
      )
    },
  })
}

function onCopyPublicKey(key) {
  navigator.clipboard.writeText(key.publicKey).then(() => {
    toast.add({
      severity: 'success',
      summary: 'Copied',
      detail: `Public key for "${key.name}" copied to clipboard.`,
      life: 2500,
    })
  })
}
</script>

<template>
  <div class="ssh-keys-section">
    <SectionHeader title="SSH Keys" icon="pi pi-key">
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
          label="Add Key"
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

      <div v-else-if="keys.length === 0" class="empty-state">
        <i class="pi pi-key empty-icon" />
        <p class="empty-title">No SSH keys configured</p>
        <p class="empty-subtitle">Add an SSH key to enable key-based authentication for nodes.</p>
        <Button label="Add First Key" icon="pi pi-plus" severity="primary" @click="openCreate" />
      </div>

      <div v-else class="card-grid">
        <SshKeyCard
          v-for="key in keys"
          :key="key.id"
          :ssh-key="key"
          @edit="openEdit"
          @delete="confirmDelete"
          @copy="onCopyPublicKey"
        />
      </div>
    </div>
  </div>

  <SshKeyDialog
    v-model:visible="dialogVisible"
    :ssh-key="editingKey"
    :saving="isSaving"
    :error="dialogError"
    @save="onDialogSave"
  />
</template>

<style scoped>
.ssh-keys-section {
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
