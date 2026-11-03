<script setup>
import { formatDateTimeShort } from '@/utils/timeFormat'
import { computed, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import AppTable from '@/components/common/AppTable.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import {
  useAgentPolicies,
  useCreateAgentPolicy,
  useUpdateAgentPolicy,
  useDeleteAgentPolicy,
} from '@/queries/useAgentPolicyQueries'
import { useWorkingState } from '@/composables/useWorkingState'

const POLICY_TYPES = [
  { label: 'Agent Config', value: 'AGENT_CONFIG' },
  { label: 'File Delivery', value: 'FILE_DELIVERY' },
  { label: 'Log Parser', value: 'LOG_PARSER' },
]

function policyTypeLabel(type) {
  return POLICY_TYPES.find((t) => t.value === type)?.label ?? type
}

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)
const { data: policies, isLoading } = useAgentPolicies(objectId)

const createMutation = useCreateAgentPolicy()
const updateMutation = useUpdateAgentPolicy()
const deleteMutation = useDeleteAgentPolicy()
const toast = useToast()
const confirm = useConfirm()

const filterText = ref('')

useWorkingState('agent-policies', { view: { filterText } })
const filteredPolicies = computed(() => {
  const list = policies.value ?? []
  if (!filterText.value) return list
  const search = filterText.value.toLowerCase()
  return list.filter((p) => (p.name ?? '').toLowerCase().includes(search))
})

const COLUMNS = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 260 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 160 },
  { id: 'lastModified', field: 'lastModified', label: 'Last Modified', sortable: true, width: 180 },
  { id: 'actions', field: null, label: '', sortable: false, width: 70 },
]

const dialogVisible = ref(false)
const editingPolicy = ref(null)
const form = ref({ name: '', type: 'AGENT_CONFIG', content: '' })
const nameError = ref(false)

function openCreate() {
  editingPolicy.value = null
  form.value = { name: '', type: 'AGENT_CONFIG', content: '' }
  nameError.value = false
  dialogVisible.value = true
}

function openEdit(policy) {
  editingPolicy.value = policy
  form.value = { name: policy.name, type: policy.type, content: policy.content ?? '' }
  nameError.value = false
  dialogVisible.value = true
}

async function onSave() {
  if (!form.value.name.trim()) {
    nameError.value = true
    return
  }
  const data = { name: form.value.name.trim(), type: form.value.type, content: form.value.content }
  try {
    if (editingPolicy.value) {
      await updateMutation.mutateAsync({
        objectId: objectId.value,
        policyId: editingPolicy.value.id,
        data,
      })
      toast.add({ severity: 'success', summary: 'Policy updated', life: 2500 })
    } else {
      await createMutation.mutateAsync({ objectId: objectId.value, data })
      toast.add({ severity: 'success', summary: 'Policy created', life: 2500 })
    }
    dialogVisible.value = false
  } catch {
    toast.add({ severity: 'error', summary: 'Save failed', life: 3000 })
  }
}

function confirmDelete(policy) {
  confirm.require({
    header: 'Delete Policy',
    message: `Delete "${policy.name}"?`,
    icon: 'pi pi-exclamation-triangle',
    acceptSeverity: 'danger',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    accept: () => deleteMutation.mutate({ objectId: objectId.value, policyId: policy.id }),
  })
}
</script>

<template>
  <div class="policies-view">
    <div class="policies-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter policies..."
          class="filter-input"
        />
      </IconField>
      <span v-if="!isLoading" class="policies-count">{{
        $plural(filteredPolicies.length, 'policy', 'policies')
      }}</span>
      <Button
        label="Create Policy"
        icon="pi pi-plus"
        size="small"
        severity="primary"
        class="create-btn"
        @click="openCreate"
      />
    </div>

    <AppTable
      :columns="COLUMNS"
      :rows="filteredPolicies"
      :loading="isLoading"
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="agent-policies"
      resize-fit
      @row-click="openEdit"
    >
      <template #cell="{ col, row }">
        <template v-if="col.id === 'type'">{{ policyTypeLabel(row.type) }}</template>
        <template v-else-if="col.id === 'lastModified'">{{
          formatDateTimeShort(row.lastModified)
        }}</template>
        <template v-else-if="col.id === 'actions'">
          <Button
            icon="pi pi-pencil"
            text
            rounded
            severity="secondary"
            size="small"
            class="row-action-btn"
            aria-label="Edit"
            @click.stop="openEdit(row)"
          />
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            size="small"
            class="row-action-btn"
            aria-label="Delete"
            @click.stop="confirmDelete(row)"
          />
        </template>
      </template>
      <template #empty>
        <div class="empty-message">No agent policies configured.</div>
      </template>
    </AppTable>

    <DemoNoticeBanner
      message="Agent Policies are not yet supported by the server; changes here are local to this session only."
    />

    <Dialog
      :visible="dialogVisible"
      :header="editingPolicy ? 'Edit Policy' : 'Create Policy'"
      modal
      :style="{ width: '32rem' }"
      @update:visible="dialogVisible = $event"
    >
      <div class="dialog-form">
        <div class="form-field" :class="{ 'field-error': nameError }">
          <label for="policy-name">Name <span class="required">*</span></label>
          <InputText
            id="policy-name"
            v-model="form.name"
            placeholder="e.g. Base Agent Configuration"
            class="w-full"
            @input="nameError = false"
          />
          <small v-if="nameError" class="error-text">Name is required</small>
        </div>

        <div class="form-field">
          <label for="policy-type">Type</label>
          <Select
            id="policy-type"
            v-model="form.type"
            :options="POLICY_TYPES"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>

        <div class="form-field">
          <label for="policy-content">Content</label>
          <Textarea
            id="policy-content"
            v-model="form.content"
            rows="8"
            class="w-full"
            placeholder="Policy content..."
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="dialogVisible = false" />
        <Button
          :label="editingPolicy ? 'Save' : 'Create'"
          icon="pi pi-check"
          :loading="createMutation.isPending.value || updateMutation.isPending.value"
          @click="onSave"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.policies-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.policies-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.policies-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.create-btn {
  margin-left: auto;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.required {
  color: var(--p-red-500);
}

.field-error :deep(.p-inputtext) {
  border-color: var(--p-red-500);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}
</style>
