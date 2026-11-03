<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useObjectQueryStore } from '@/stores/objectQueryStore'

// Per-browser: the legacy list is server-side, but the WebAPI has no object-query CRUD.
const props = defineProps({
  currentScript: { type: String, default: '' },
})

const emit = defineEmits(['select'])

const store = useObjectQueryStore()

const saveDialogVisible = ref(false)
const draftName = ref('')

const canSave = computed(() => props.currentScript.trim().length > 0)

function openSaveDialog() {
  draftName.value = ''
  saveDialogVisible.value = true
}

function confirmSave() {
  const name = draftName.value.trim()
  if (!name) return
  store.save(name, props.currentScript)
  saveDialogVisible.value = false
}
</script>

<template>
  <div class="saved-list">
    <div class="saved-header">
      <span class="saved-title">Saved queries</span>
      <Button
        v-tooltip.bottom="'Save current query'"
        icon="pi pi-plus"
        size="small"
        text
        rounded
        severity="secondary"
        aria-label="Save current query"
        :disabled="!canSave"
        @click="openSaveDialog"
      />
    </div>

    <ul v-if="store.saved.length" class="saved-items">
      <li v-for="query in store.saved" :key="query.id" class="saved-item">
        <button
          type="button"
          class="saved-name"
          :title="query.script"
          @click="emit('select', query)"
        >
          {{ query.name }}
        </button>
        <Button
          v-tooltip.bottom="'Delete'"
          icon="pi pi-trash"
          size="small"
          text
          rounded
          severity="secondary"
          :aria-label="`Delete ${query.name}`"
          @click="store.remove(query.id)"
        />
      </li>
    </ul>

    <p v-else class="saved-empty">
      No saved queries yet. Write a query and use the + button to keep it.
    </p>

    <p class="saved-note">Visible only to you.</p>

    <Dialog
      v-model:visible="saveDialogVisible"
      modal
      header="Save query"
      :style="{ width: '24rem' }"
    >
      <label for="saved-query-name" class="dialog-label">Name</label>
      <InputText
        id="saved-query-name"
        v-model="draftName"
        class="dialog-input"
        autocomplete="off"
        autofocus
        @keydown.enter="confirmSave"
      />
      <p class="dialog-note">Saving under an existing name replaces that query.</p>
      <template #footer>
        <Button
          label="Cancel"
          text
          severity="secondary"
          size="small"
          @click="saveDialogVisible = false"
        />
        <Button label="Save" size="small" :disabled="!draftName.trim()" @click="confirmSave" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.saved-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem 0.625rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  min-width: 0;
}

.saved-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.saved-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.saved-items {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 12rem;
  overflow-y: auto;
}

.saved-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.saved-name {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--p-text-color);
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-name:hover {
  background: var(--p-surface-hover);
}

.saved-empty,
.saved-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.saved-note {
  padding-top: 0.25rem;
  border-top: 1px solid var(--p-surface-border);
}

.dialog-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.dialog-input {
  width: 100%;
}

.dialog-note {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
