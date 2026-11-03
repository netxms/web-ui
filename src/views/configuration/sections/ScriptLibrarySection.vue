<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ContextMenu from 'primevue/contextmenu'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ScriptEditor from '@/components/script-library/ScriptEditor.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { useScriptLibrary, useCreateScript, useDeleteScript } from '@/queries/useScriptQueries'
import { useWorkingState } from '@/composables/useWorkingState'

const confirm = useConfirm()
const toast = useToast()

const {
  data: libraryData,
  isLoading: isLibraryLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useScriptLibrary()
const scripts = computed(() => libraryData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('script-library', { view: { filterState } })
const filteredScripts = computed(() => {
  if (!filterState.value.text) return scripts.value
  const search = filterState.value.text.toLowerCase()
  return scripts.value.filter((s) => s.name.toLowerCase().includes(search))
})

// Dirty-check on switch.
const selectedScriptId = ref(null)
const editorRef = ref(null)

function handleScriptSelect(id) {
  if (id === selectedScriptId.value) return
  if (editorRef.value?.isDirty) {
    confirm.require({
      header: 'Unsaved Changes',
      message: 'Discard unsaved changes and switch scripts?',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: 'Discard',
      acceptSeverity: 'danger',
      accept: () => {
        selectedScriptId.value = id
      },
    })
  } else {
    selectedScriptId.value = id
  }
}

const contextMenu = ref()
const contextScript = ref(null)

function onContextMenu(event, script) {
  contextScript.value = script
  contextMenu.value.show(event)
}

const contextMenuItems = computed(() => [
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => confirmDelete(contextScript.value),
  },
])

const { mutate: deleteScript } = useDeleteScript()

function confirmDelete(script) {
  confirm.require({
    header: 'Delete Script',
    message: `Delete "${script.name}"? This cannot be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    accept: () => {
      deleteScript(script.id, {
        onSuccess: () => {
          toast.add({ severity: 'success', summary: 'Script deleted', life: 2000 })
          if (selectedScriptId.value === script.id) {
            selectedScriptId.value = null
          }
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete failed',
            detail: err.message,
            life: 4000,
          })
        },
      })
    },
  })
}

const newScriptVisible = ref(false)
const newScriptName = ref('')
const { mutate: createScript, isPending: isCreating } = useCreateScript()

function openNewScriptDialog() {
  if (editorRef.value?.isDirty) {
    confirm.require({
      header: 'Unsaved Changes',
      message: 'Discard unsaved changes and create a new script?',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: 'Discard',
      acceptSeverity: 'danger',
      accept: () => {
        newScriptName.value = ''
        newScriptVisible.value = true
      },
    })
  } else {
    newScriptName.value = ''
    newScriptVisible.value = true
  }
}

function confirmCreateScript() {
  if (!newScriptName.value.trim()) return
  createScript(
    { name: newScriptName.value.trim(), code: '' },
    {
      onSuccess: (result) => {
        newScriptVisible.value = false
        selectedScriptId.value = result.id
        toast.add({ severity: 'success', summary: 'Script created', life: 2000 })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Create failed',
          detail: err.message,
          life: 4000,
        })
      },
    },
  )
}
</script>

<template>
  <div class="script-library-section">
    <div class="script-list-panel">
      <SectionHeader :title="`Scripts (${scripts.length})`" icon="pi pi-code">
        <template #actions>
          <RefetchIndicator :is-fetching="isFetching && !isLibraryLoading" />
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
            v-tooltip.bottom="'New script'"
            aria-label="New script"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            text
            rounded
            @click="openNewScriptDialog"
          />
        </template>
      </SectionHeader>

      <div class="list-filter">
        <SmartFilterInput v-model="filterState" placeholder="Filter scripts..." size="small" />
      </div>

      <div class="script-list">
        <template v-if="isLibraryLoading">
          <div v-for="i in 10" :key="i" class="script-item-skeleton">
            <Skeleton width="70%" height="0.875rem" />
            <Skeleton width="1.75rem" height="0.75rem" />
          </div>
        </template>
        <div v-else-if="isError" class="list-error">
          <QueryErrorState :error="error" @retry="refetch" />
        </div>
        <template v-else>
          <button
            type="button"
            v-for="script in filteredScripts"
            :key="script.id"
            class="script-item"
            :class="{ active: selectedScriptId === script.id }"
            @click="handleScriptSelect(script.id)"
            @contextmenu.prevent="onContextMenu($event, script)"
          >
            <span class="script-name">{{ script.name }}</span>
            <span class="script-id">#{{ script.id }}</span>
          </button>
          <div v-if="filteredScripts.length === 0 && filterState.text" class="list-empty">
            No scripts match "{{ filterState.text }}"
          </div>
          <div v-else-if="scripts.length === 0" class="list-empty">No scripts defined</div>
        </template>
      </div>
    </div>

    <div class="script-editor-panel">
      <ScriptEditor
        v-if="selectedScriptId !== null"
        ref="editorRef"
        :script-id="selectedScriptId"
      />
      <div v-else class="editor-empty-state">
        <i class="pi pi-code editor-empty-icon" />
        <span class="editor-empty-text">Select a script to edit</span>
      </div>
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <Dialog
      v-model:visible="newScriptVisible"
      header="New Script"
      :style="{ width: '24rem' }"
      modal
    >
      <div class="new-script-field">
        <label for="new-script-name">Script name</label>
        <InputText
          id="new-script-name"
          v-model="newScriptName"
          placeholder="my_script_name"
          class="new-script-input"
          autofocus
          @keydown.enter="confirmCreateScript"
        />
      </div>
      <template #footer>
        <Button
          label="Cancel"
          severity="secondary"
          size="small"
          @click="newScriptVisible = false"
        />
        <Button
          label="Create"
          size="small"
          :disabled="!newScriptName.trim() || isCreating"
          :loading="isCreating"
          @click="confirmCreateScript"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.script-library-section {
  display: flex;
  height: 100%;
  min-height: 0;
}

.script-list-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--p-surface-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--p-surface-card);
}

.list-filter {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.filter-input {
  width: 100%;
}

.script-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.script-item {
  /* Now a <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.625rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.script-item:hover {
  background: var(--p-surface-hover);
}

.script-item.active {
  background: var(--p-primary-50);
  color: var(--p-primary-color);
}

.script-name {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.script-id {
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  flex-shrink: 0;
  white-space: nowrap;
}

.script-item.active .script-id {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  color: var(--p-primary-color);
}

.script-item-skeleton {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.625rem;
  gap: 0.5rem;
}

.list-empty {
  padding: 1.5rem 0.625rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  text-align: center;
}

.list-error {
  display: flex;
  justify-content: center;
  padding: 1.5rem 0.625rem;
}

.script-editor-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.editor-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
}

.editor-empty-icon {
  font-size: 2.5rem;
  opacity: 0.3;
}

.editor-empty-text {
  font-size: 0.9375rem;
}

.new-script-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.new-script-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.new-script-input {
  width: 100%;
}
</style>
