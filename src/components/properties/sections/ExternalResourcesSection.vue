<script setup>
import { ref } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { isSafeExternalUrl } from '@/utils/sanitize'

const INVALID_URL_MESSAGE = 'Enter an absolute http:// or https:// URL'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const urls = () => props.draft.urls ?? []

const editingId = ref(null)
const editUrl = ref('')
const editDescription = ref('')
const editUrlError = ref('')

function startEdit(u) {
  editingId.value = u.id
  editUrl.value = u.url
  editDescription.value = u.description ?? ''
  editUrlError.value = ''
}

function commitEdit() {
  if (!editUrl.value.trim()) {
    editUrlError.value = 'URL is required'
    return
  }
  if (!isSafeExternalUrl(editUrl.value)) {
    editUrlError.value = INVALID_URL_MESSAGE
    return
  }
  const idx = props.draft.urls.findIndex((u) => u.id === editingId.value)
  if (idx !== -1) {
    props.draft.urls[idx] = {
      ...props.draft.urls[idx],
      url: editUrl.value.trim(),
      description: editDescription.value.trim() || null,
    }
  }
  editingId.value = null
  editUrlError.value = ''
}

function cancelEdit() {
  editingId.value = null
  editUrlError.value = ''
}

function deleteUrl(u) {
  props.draft.urls = props.draft.urls.filter((x) => x.id !== u.id)
}

const addUrlValue = ref('')
const addDescription = ref('')
const addUrlError = ref('')
const nextTempId = ref(-1)

function addEntry() {
  const url = addUrlValue.value.trim()
  if (!url) {
    addUrlError.value = 'URL is required'
    return
  }
  if (!isSafeExternalUrl(url)) {
    addUrlError.value = INVALID_URL_MESSAGE
    return
  }
  addUrlError.value = ''
  props.draft.urls = [
    ...props.draft.urls,
    { id: nextTempId.value--, url, description: addDescription.value.trim() || null },
  ]
  addUrlValue.value = ''
  addDescription.value = ''
}

function onAddKeyEnter() {
  if (addUrlValue.value.trim()) addEntry()
}
</script>

<template>
  <div class="external-resources-section">
    <div class="er-header">
      <span class="er-title">
        External Resources
        <span class="er-count">({{ urls().length }})</span>
      </span>
    </div>

    <div class="er-card">
      <table class="url-table">
        <thead>
          <tr>
            <th class="col-url">URL</th>
            <th class="col-desc">Description</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in urls()" :key="u.id">
            <template v-if="editingId === u.id">
              <td class="col-url">
                <InputText
                  v-model="editUrl"
                  class="row-input"
                  :class="{ 'p-invalid': editUrlError }"
                  placeholder="https://..."
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                />
                <small v-if="editUrlError" class="p-error">{{ editUrlError }}</small>
              </td>
              <td class="col-desc">
                <InputText
                  v-model="editDescription"
                  class="row-input"
                  placeholder="Description (optional)"
                  @keyup.enter="commitEdit"
                  @keyup.escape="cancelEdit"
                />
              </td>
              <td class="col-actions">
                <Button
                  aria-label="Save URL"
                  icon="pi pi-check"
                  size="small"
                  text
                  severity="success"
                  @click="commitEdit"
                />
                <Button
                  aria-label="Cancel editing"
                  icon="pi pi-times"
                  size="small"
                  text
                  severity="secondary"
                  @click="cancelEdit"
                />
              </td>
            </template>
            <template v-else>
              <td class="col-url url-cell">
                <!-- Entries from another client may carry a javascript: URI. -->
                <a
                  v-if="isSafeExternalUrl(u.url)"
                  :href="u.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="url-link"
                  >{{ u.url }}</a
                >
                <span v-else class="url-unsafe" :title="INVALID_URL_MESSAGE">{{ u.url }}</span>
              </td>
              <td class="col-desc desc-cell">
                <span v-if="u.description">{{ u.description }}</span>
                <span v-else class="no-desc">—</span>
              </td>
              <td class="col-actions">
                <Button
                  aria-label="Edit URL"
                  icon="pi pi-pencil"
                  size="small"
                  text
                  severity="secondary"
                  :disabled="editingId !== null"
                  @click="startEdit(u)"
                />
                <Button
                  aria-label="Delete URL"
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  :disabled="editingId !== null"
                  @click="deleteUrl(u)"
                />
              </td>
            </template>
          </tr>

          <tr v-if="urls().length === 0">
            <td colspan="3" class="empty-state">No external resources defined</td>
          </tr>
        </tbody>
      </table>

      <div class="add-bar">
        <InputText
          v-model="addUrlValue"
          placeholder="https://..."
          class="add-url"
          :class="{ 'p-invalid': addUrlError }"
          @keyup.enter="onAddKeyEnter"
        />
        <InputText
          v-model="addDescription"
          placeholder="Description (optional)"
          class="add-desc"
          @keyup.enter="onAddKeyEnter"
        />
        <Button icon="pi pi-plus" label="Add" size="small" outlined @click="addEntry" />
        <small v-if="addUrlError" class="p-error add-error">{{ addUrlError }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.external-resources-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.er-header {
  display: flex;
  align-items: center;
}

.er-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.er-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.er-card {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
}

.url-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.url-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
  border-right: 1px solid var(--p-surface-border);
  white-space: nowrap;
}

.url-table th:last-child {
  border-right: none;
}

.url-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
  border-bottom: 1px solid var(--p-surface-border);
  border-right: 1px solid var(--p-surface-border);
}

.url-table td:last-child {
  border-right: none;
}

.url-table tbody tr:last-child td {
  border-bottom: none;
}

.col-url {
  width: 45%;
}

.col-desc {
  width: 40%;
}

.col-actions {
  width: 5rem;
  white-space: nowrap;
}

.url-link {
  color: var(--p-primary-color);
  text-decoration: none;
  word-break: break-all;
}

.url-link:hover {
  text-decoration: underline;
}

/* Stored URL with a scheme we refuse to link (see isSafeExternalUrl). */
.url-unsafe {
  color: var(--p-text-muted-color);
  text-decoration: line-through;
  word-break: break-all;
  cursor: help;
}

.desc-cell {
  word-break: break-word;
}

.no-desc {
  color: var(--p-text-muted-color);
}

.row-input {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 1.5rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.add-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem;
  border-top: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-wrap: wrap;
}

.add-url {
  flex: 1 1 0;
  min-width: 12rem;
}

.add-desc {
  flex: 1 1 0;
  min-width: 10rem;
}

.add-error {
  color: var(--p-red-500);
  font-size: 0.75rem;
}
</style>
