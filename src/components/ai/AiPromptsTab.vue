<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import {
  useSavedPrompts,
  useCreateSavedPrompt,
  useUpdateSavedPrompt,
  useDeleteSavedPrompt,
} from '@/queries/useAiQueries'

const confirm = useConfirm()
const toast = useToast()

const { data: promptsData, isLoading, isFetching, isError, error, refetch } = useSavedPrompts()

defineExpose({ refetch })

const prompts = computed(() => promptsData.value ?? [])

const { mutate: createPrompt, isPending: isCreating } = useCreateSavedPrompt()
const { mutate: updatePrompt, isPending: isUpdating } = useUpdateSavedPrompt()
const { mutate: deletePrompt } = useDeleteSavedPrompt()

const isSaving = computed(() => isCreating.value || isUpdating.value)

const showPromptDialog = ref(false)
const editingPrompt = ref(null)
const promptForm = ref({ name: '', description: '', promptText: '' })
const promptNameError = ref(false)
const promptTextError = ref(false)
const promptDialogError = ref(null)

const promptDialogTitle = computed(() =>
  editingPrompt.value ? 'Edit Saved Prompt' : 'New Saved Prompt',
)

function openAddPrompt() {
  editingPrompt.value = null
  promptForm.value = { name: '', description: '', promptText: '' }
  promptNameError.value = false
  promptTextError.value = false
  promptDialogError.value = null
  showPromptDialog.value = true
}

function openEditPrompt(prompt) {
  editingPrompt.value = prompt
  promptForm.value = {
    name: prompt.name,
    description: prompt.description ?? '',
    promptText: prompt.promptText,
  }
  promptNameError.value = false
  promptTextError.value = false
  promptDialogError.value = null
  showPromptDialog.value = true
}

function confirmSavePrompt() {
  promptNameError.value = !promptForm.value.name.trim()
  promptTextError.value = !promptForm.value.promptText.trim()
  if (promptNameError.value || promptTextError.value) return

  promptDialogError.value = null
  const payload = {
    name: promptForm.value.name.trim(),
    description: promptForm.value.description.trim() || null,
    promptText: promptForm.value.promptText.trim(),
  }

  if (editingPrompt.value) {
    updatePrompt(
      { promptId: editingPrompt.value.id, data: payload },
      {
        onSuccess: () => {
          showPromptDialog.value = false
        },
        onError: (err) => {
          promptDialogError.value = err.message ?? 'Failed to update prompt.'
        },
      },
    )
  } else {
    createPrompt(payload, {
      onSuccess: () => {
        showPromptDialog.value = false
      },
      onError: (err) => {
        promptDialogError.value = err.message ?? 'Failed to create prompt.'
      },
    })
  }
}

function confirmDeletePrompt(prompt) {
  confirm.require({
    message: `Delete saved prompt "${prompt.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deletePrompt(
        { promptId: prompt.id },
        {
          onSuccess: () => {
            toast.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `Prompt "${prompt.name}" deleted.`,
              life: 3000,
            })
          },
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? 'Failed to delete prompt.',
              life: 5000,
            })
          },
        },
      )
    },
  })
}

const promptColumns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 220 },
  { id: 'description', field: 'description', label: 'Description', sortable: false, width: 400 },
  { id: 'actions', field: 'actions', label: '', width: 80 },
]
</script>

<template>
  <div class="ai-tab">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="tab-toolbar">
      <span class="tab-toolbar-title">Saved Prompts</span>
      <div class="tab-toolbar-actions">
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
          label="New Prompt"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openAddPrompt"
        />
      </div>
    </div>

    <div v-if="isLoading" class="table-loading">
      <Skeleton v-for="i in 4" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="promptColumns"
      :rows="prompts"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="ai-prompts"
      class="items-table"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'name'" class="item-name">{{ row.name }}</span>
        <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">{{
          row.description || '—'
        }}</span>
        <div v-else-if="col.id === 'actions'" class="row-actions">
          <Button
            v-tooltip.top="'Edit'"
            icon="pi pi-pencil"
            text
            rounded
            severity="secondary"
            size="small"
            aria-label="Edit prompt"
            @click.stop="openEditPrompt(row)"
          />
          <Button
            v-tooltip.top="'Delete'"
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            size="small"
            aria-label="Delete prompt"
            @click.stop="confirmDeletePrompt(row)"
          />
        </div>
      </template>
      <template #empty>
        <div class="table-empty">No saved prompts. Click "New Prompt" to create one.</div>
      </template>
    </AppTable>
  </div>

  <Dialog
    v-model:visible="showPromptDialog"
    :header="promptDialogTitle"
    modal
    :style="{ width: '36rem' }"
    :draggable="false"
  >
    <div class="ai-dialog-body">
      <div class="ai-dialog-field">
        <label for="prompt-name">Name <span class="required-star">*</span></label>
        <InputText
          id="prompt-name"
          v-model="promptForm.name"
          :class="{ 'p-invalid': promptNameError }"
          placeholder="e.g. Summarize recent alarms"
          autofocus
          fluid
        />
        <small v-if="promptNameError" class="error-text">Name is required.</small>
      </div>
      <div class="ai-dialog-field">
        <label for="prompt-description">Description</label>
        <InputText
          id="prompt-description"
          v-model="promptForm.description"
          placeholder="Optional short description"
          fluid
        />
      </div>
      <div class="ai-dialog-field">
        <label for="prompt-text">Prompt Text <span class="required-star">*</span></label>
        <Textarea
          id="prompt-text"
          v-model="promptForm.promptText"
          :class="{ 'p-invalid': promptTextError }"
          class="prompt-textarea"
          :rows="6"
          placeholder="Enter the full prompt text..."
          fluid
          auto-resize
        />
        <small v-if="promptTextError" class="error-text">Prompt text is required.</small>
      </div>
      <MutationErrorState :error="promptDialogError" />
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="showPromptDialog = false" />
      <Button
        label="Save"
        severity="primary"
        :loading="isSaving"
        :disabled="isSaving"
        @click="confirmSavePrompt"
      />
    </template>
  </Dialog>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.prompt-textarea {
  max-height: 12rem;
  overflow-y: auto !important;
}
</style>
