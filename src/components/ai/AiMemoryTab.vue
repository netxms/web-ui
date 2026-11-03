<script setup>
/**
 * AI memory: what the assistant remembers about the environment, a user or an object (legacy
 * `AiMemoryManager`). Shown under construction while the server feature may still change; flip
 * `UNDER_CONSTRUCTION` to release it.
 */
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import AiMemoryEntryDialog from '@/components/ai/AiMemoryEntryDialog.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'
import {
  useAiMemoryEntries,
  useDeleteAiMemoryEntry,
  useSaveAiMemoryEntry,
} from '@/queries/useAiQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useUsers } from '@/queries/useUserQueries'
import { useAuthStore } from '@/stores/authStore'
import { memoryScopeLabel, memorySourceLabel } from '@/utils/aiMemoryDisplay'
import { formatDateTime } from '@/utils/timeFormat'

const UNDER_CONSTRUCTION = true
const UNDER_CONSTRUCTION_MESSAGE =
  'AI memory is new on the server and may still change; this view is ready but not enabled yet.'

const confirm = useConfirm()
const toast = useToast()
const { can } = usePermissions()
const authStore = useAuthStore()

const { data, isLoading, isFetching, error, refetch } = useAiMemoryEntries()
defineExpose({ refetch })

const entries = computed(() => data.value ?? [])

// Listing users needs "Manage users" (`useUsers` treats the 403 as normal); without it the
// caller's own name is still known, and everyone else reads as [id], as in legacy.

const { data: usersData } = useUsers()
const currentUserId = computed(() => authStore.user?.id ?? null)

function userName(id) {
  const user = (usersData.value ?? []).find((u) => u.id === id)
  if (user) return user.name
  if (id === currentUserId.value && authStore.user?.username) return authStore.user.username
  return `[${id}]`
}

const userOptions = computed(() => {
  const users = (usersData.value ?? [])
    .filter((u) => u.id !== 0 && !u.flags?.disabled)
    .map((u) => ({ value: u.id, label: u.name }))
  if (currentUserId.value != null && !users.some((u) => u.value === currentUserId.value)) {
    users.push({ value: currentUserId.value, label: userName(currentUserId.value) })
  }
  return users.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
})

const objectIds = computed(() => [
  ...new Set(entries.value.filter((e) => e.scope === 'object').map((e) => e.scopeId)),
])
const { objectsById } = useObjectsByIds(objectIds)

function targetLabel(entry) {
  if (entry.scope === 'user') return userName(entry.scopeId)
  if (entry.scope === 'object') {
    return objectsById.value.get(entry.scopeId)?.name ?? `[${entry.scopeId}]`
  }
  return ''
}

const filterState = ref({ text: '', tokens: [] })
useWorkingState('ai-memory', { view: { filterState } })

const rows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  return entries.value
    .map((entry) => ({
      ...entry,
      scopeLabel: memoryScopeLabel(entry.scope),
      target: targetLabel(entry),
      createdByLabel: entry.createdBy === 'model' ? 'Model' : 'Human',
      source: memorySourceLabel(entry, userName(entry.sourceUserId)),
    }))
    .filter(
      (row) =>
        !search ||
        [row.title, row.content, row.target, row.scopeLabel].some((value) =>
          (value ?? '').toLowerCase().includes(search),
        ),
    )
})

const columns = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 70 },
  { id: 'scope', field: 'scopeLabel', label: 'Scope', sortable: true, width: 110 },
  { id: 'target', field: 'target', label: 'User / Object', sortable: true, width: 160 },
  { id: 'title', field: 'title', label: 'Title', sortable: true, width: 240 },
  { id: 'content', field: 'content', label: 'Content', sortable: false, width: 380 },
  { id: 'createdBy', field: 'createdByLabel', label: 'Created by', sortable: true, width: 100 },
  { id: 'source', field: 'source', label: 'Source', sortable: true, width: 180 },
  { id: 'createdAt', field: 'createdAt', label: 'Created', sortable: true, width: 150 },
  { id: 'updatedAt', field: 'updatedAt', label: 'Updated', sortable: true, width: 150 },
  { id: 'locked', field: 'locked', label: 'Locked', sortable: true, width: 80 },
  { id: 'actions', field: 'actions', label: '', width: 110 },
]

const dialogVisible = ref(false)
const editingEntry = ref(null)

function openNew() {
  editingEntry.value = null
  dialogVisible.value = true
}

function openEdit(entry) {
  editingEntry.value = entry
  dialogVisible.value = true
}

const { mutate: saveEntry } = useSaveAiMemoryEntry()
const { mutate: deleteEntry } = useDeleteAiMemoryEntry()

function failed(summary) {
  return (err) => toast.add({ severity: 'error', summary, detail: err?.message, life: 5000 })
}

function toggleLocked(entry) {
  saveEntry(
    { memoryId: entry.id, data: { locked: !entry.locked } },
    { onError: failed('Could not change the entry') },
  )
}

function confirmDelete(entry) {
  confirm.require({
    message: `Delete memory entry "${entry.title}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () =>
      deleteEntry({ memoryId: entry.id }, { onError: failed('Could not delete the entry') }),
  })
}
</script>

<template>
  <component
    :is="UNDER_CONSTRUCTION ? UnderConstructionOverlay : 'div'"
    :message="UNDER_CONSTRUCTION_MESSAGE"
    class="memory-host"
  >
    <div class="ai-tab">
      <RefetchIndicator :is-fetching="isFetching && !isLoading" />

      <div class="tab-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter memory..."
          class="filter-input"
        />
        <div class="tab-toolbar-actions">
          <span v-if="!isLoading" class="item-count">{{
            $plural(rows.length, 'entry', 'entries')
          }}</span>
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
          <Button label="New Entry" icon="pi pi-plus" size="small" @click="openNew" />
        </div>
      </div>

      <div v-if="isLoading" class="table-loading">
        <Skeleton v-for="i in 4" :key="i" height="2rem" class="mb-2" />
      </div>

      <AppTable
        v-else
        :columns="columns"
        :rows="rows"
        :error="error"
        striped
        column-borders
        resize-fit
        sort-field="updatedAt"
        :sort-order="-1"
        :page-size="50"
        storage-key="ai-memory"
        class="items-table"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'title'" class="item-name">{{ row.title }}</span>
          <span v-else-if="col.id === 'content'" class="memory-content-cell">{{
            row.content.replace(/\n/g, ' ')
          }}</span>
          <span v-else-if="col.id === 'createdAt' || col.id === 'updatedAt'">{{
            formatDateTime(row[col.field], { unixSeconds: true })
          }}</span>
          <span v-else-if="col.id === 'locked'">{{ row.locked ? 'Yes' : 'No' }}</span>
          <div v-else-if="col.id === 'actions'" class="row-actions">
            <Button
              v-tooltip.top="'Edit'"
              icon="pi pi-pencil"
              text
              rounded
              severity="secondary"
              size="small"
              aria-label="Edit entry"
              @click.stop="openEdit(row)"
            />
            <Button
              v-tooltip.top="row.locked ? 'Unlock' : 'Lock'"
              :icon="row.locked ? 'pi pi-lock-open' : 'pi pi-lock'"
              text
              rounded
              severity="secondary"
              size="small"
              :aria-label="row.locked ? 'Unlock entry' : 'Lock entry'"
              @click.stop="toggleLocked(row)"
            />
            <Button
              v-tooltip.top="'Delete'"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              size="small"
              aria-label="Delete entry"
              @click.stop="confirmDelete(row)"
            />
          </div>
          <template v-else>{{ row[col.field] }}</template>
        </template>
        <template #empty>
          <div class="table-empty">
            Nothing remembered yet. The assistant adds entries as it works, or click "New Entry".
          </div>
        </template>
      </AppTable>
    </div>

    <AiMemoryEntryDialog
      v-model:visible="dialogVisible"
      :entry="editingEntry"
      :can-manage-memory="!!can.manageAiMemory"
      :current-user-id="currentUserId"
      :user-options="userOptions"
      :target-label="editingEntry ? targetLabel(editingEntry) : ''"
    />
  </component>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.memory-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-input {
  flex: 1;
  max-width: 24rem;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
}

.memory-content-cell {
  color: var(--p-text-muted-color);
}
</style>
