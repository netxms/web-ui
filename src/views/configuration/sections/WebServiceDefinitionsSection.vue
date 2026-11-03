<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import ContextMenu from 'primevue/contextmenu'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import WebServiceDetailView from '@/components/web-services/WebServiceDetailView.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import {
  useWebServiceDefinitions,
  useCreateWebServiceDefinition,
  useDeleteWebServiceDefinition,
} from '@/queries/useWebServiceQueries'
import { useWorkingState } from '@/composables/useWorkingState'

const confirm = useConfirm()
const toast = useToast()

const {
  data: listData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useWebServiceDefinitions()
const definitions = computed(() => listData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('web-service-definitions', { view: { filterState } })
const filteredDefinitions = computed(() => {
  let list = definitions.value
  if (filterState.value.text) {
    const search = filterState.value.text.toLowerCase()
    list = list.filter(
      (d) => d.name.toLowerCase().includes(search) || d.url.toLowerCase().includes(search),
    )
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedId = ref(null)
const isCreatingNew = ref(false)
const detailRef = ref(null)

const isDetailVisible = computed(() => isCreatingNew.value || selectedId.value !== null)

const selectedDefinition = computed(() => {
  if (isCreatingNew.value) return null
  return definitions.value.find((d) => d.id === selectedId.value) ?? null
})

function tryNavigate(action) {
  if (detailRef.value?.isDirty) {
    confirm.require({
      header: 'Unsaved Changes',
      message: 'Discard unsaved changes?',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: 'Discard',
      acceptSeverity: 'danger',
      accept: action,
    })
  } else {
    action()
  }
}

function selectDefinition(id) {
  if (!isCreatingNew.value && id === selectedId.value) return
  tryNavigate(() => {
    selectedId.value = id
    isCreatingNew.value = false
  })
}

function openNew() {
  tryNavigate(() => {
    selectedId.value = null
    isCreatingNew.value = true
  })
}

function onDetailSaved(result) {
  if (result && typeof result === 'object' && result.id) {
    isCreatingNew.value = false
    selectedId.value = result.id
  }
}

function onDetailClose() {
  isCreatingNew.value = false
  selectedId.value = null
}

const contextMenu = ref()
const contextDefinition = ref(null)

function onContextMenu(event, definition) {
  contextDefinition.value = definition
  contextMenu.value.show(event)
}

const { mutate: createDefinition } = useCreateWebServiceDefinition()
const { mutate: deleteDefinition } = useDeleteWebServiceDefinition()

function duplicateDefinition(def) {
  const payload = {
    name: `Copy of ${def.name}`,
    description: def.description,
    url: def.url,
    httpRequestMethod: def.httpRequestMethod,
    requestData: def.requestData,
    authType: def.authType,
    login: def.login,
    password: def.password,
    cacheRetentionTime: def.cacheRetentionTime,
    requestTimeout: def.requestTimeout,
    flags: def.flags,
    headers: (def.headers ?? []).map(({ name, value }) => ({ name, value })),
  }
  createDefinition(payload, {
    onSuccess: (result) => {
      isCreatingNew.value = false
      selectedId.value = result.id
      toast.add({ severity: 'success', summary: 'Definition duplicated', life: 2000 })
    },
    onError: (err) => {
      toast.add({ severity: 'error', summary: 'Duplicate failed', detail: err.message, life: 4000 })
    },
  })
}

function confirmDelete(def) {
  confirm.require({
    header: 'Delete Web Service Definition',
    message: `Delete "${def.name}"? This cannot be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    accept: () => {
      deleteDefinition(def.id, {
        onSuccess: () => {
          toast.add({ severity: 'success', summary: 'Definition deleted', life: 2000 })
          if (selectedId.value === def.id) {
            selectedId.value = null
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

const contextMenuItems = computed(() => [
  {
    label: 'Duplicate',
    icon: 'pi pi-copy',
    command: () => duplicateDefinition(contextDefinition.value),
  },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => confirmDelete(contextDefinition.value),
  },
])

const METHOD_LABELS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const AUTH_LABELS = ['None', 'Basic', 'Digest', 'NTLM', 'Bearer', 'Any']

const METHOD_SEVERITY = {
  0: 'secondary', // GET
  1: 'success', // POST
  2: 'info', // PUT
  3: 'danger', // DELETE
  4: 'warn', // PATCH
}

function methodLabel(def) {
  return METHOD_LABELS[def.httpRequestMethod] ?? null
}

function authLabel(def) {
  if (!def.authType) return null
  return AUTH_LABELS[def.authType] ?? null
}

function methodTagClass(def) {
  const sev = METHOD_SEVERITY[def.httpRequestMethod]
  return sev ? `tag tag--${sev}` : null
}
</script>

<template>
  <div class="ws-definitions-section">
    <div class="list-panel">
      <SectionHeader title="Web Service Definitions" icon="pi pi-globe">
        <template #actions>
          <RefetchIndicator :is-fetching="isFetching && !isLoading" />
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
            v-tooltip.bottom="'New definition'"
            aria-label="New definition"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            text
            rounded
            @click="openNew"
          />
        </template>
      </SectionHeader>

      <div class="list-filter">
        <SmartFilterInput v-model="filterState" placeholder="Filter definitions..." size="small" />
      </div>

      <div class="definition-list">
        <template v-if="isLoading">
          <div v-for="i in 8" :key="i" class="definition-item-skeleton">
            <div class="skeleton-row">
              <Skeleton width="55%" height="0.8125rem" />
              <Skeleton width="2.5rem" height="0.75rem" />
            </div>
            <Skeleton width="80%" height="0.75rem" style="margin-top: 0.2rem" />
          </div>
        </template>
        <div v-else-if="isError" class="list-error">
          <QueryErrorState :error="error" @retry="refetch" />
        </div>
        <template v-else>
          <button
            type="button"
            v-for="def in filteredDefinitions"
            :key="def.id"
            class="definition-item"
            :class="{ active: !isCreatingNew && selectedId === def.id }"
            @click="selectDefinition(def.id)"
            @contextmenu.prevent="onContextMenu($event, def)"
          >
            <div class="item-row-top">
              <span class="item-name">{{ def.name }}</span>
              <div class="item-tags">
                <span :class="methodTagClass(def)">{{ methodLabel(def) }}</span>
                <span v-if="def.authType !== 0" class="tag tag--secondary">
                  {{ authLabel(def) }}
                </span>
              </div>
            </div>
            <div class="item-url">{{ def.url }}</div>
          </button>

          <div v-if="isCreatingNew" class="definition-item definition-item--new active">
            <div class="item-row-top">
              <span class="item-name">New Definition</span>
            </div>
            <div class="item-url item-url--placeholder">unsaved</div>
          </div>

          <div v-if="filteredDefinitions.length === 0 && !isCreatingNew" class="list-empty">
            <template v-if="filterState.text"
              >No definitions match "{{ filterState.text }}"</template
            >
            <template v-else>No web service definitions defined</template>
          </div>
        </template>
      </div>
    </div>

    <div class="detail-panel">
      <WebServiceDetailView
        v-if="isDetailVisible"
        ref="detailRef"
        :definition="selectedDefinition"
        @saved="onDetailSaved"
        @close="onDetailClose"
      />
      <div v-else class="detail-empty-state">
        <i class="pi pi-globe detail-empty-icon" />
        <span class="detail-empty-title">Web Service Definitions</span>
        <span class="detail-empty-text">
          Select a definition to edit, or click + to create a new one.
        </span>
      </div>
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />
  </div>
</template>

<style scoped>
.ws-definitions-section {
  display: flex;
  height: 100%;
  min-height: 0;
}

.list-panel {
  width: 300px;
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

.definition-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.definition-item {
  /* Now a <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.5rem 0.625rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.definition-item:hover {
  background: var(--p-surface-hover);
}

.definition-item.active {
  background: var(--p-primary-50);
  color: var(--p-primary-color);
}

.item-row-top {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.item-name {
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.item-tags {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.item-url {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0.125rem;
}

.definition-item.active .item-url {
  color: color-mix(in srgb, var(--p-primary-color) 60%, transparent);
}

.item-url--placeholder {
  font-style: italic;
  opacity: 0.5;
}

.definition-item-skeleton {
  padding: 0.5rem 0.625rem;
}

.skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.tag {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.15em 0.4em;
  border-radius: 3px;
  white-space: nowrap;
}

.tag--success {
  background: var(--p-green-100);
  color: var(--p-green-700);
}

.tag--info {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.tag--danger {
  background: var(--p-red-100);
  color: var(--p-red-700);
}

.tag--warn {
  background: var(--p-orange-100);
  color: var(--p-orange-700);
}

.tag--secondary {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

:global(.app-dark) .tag--success {
  background: color-mix(in srgb, var(--p-green-400) 15%, transparent);
  color: var(--p-green-300);
}

:global(.app-dark) .tag--info {
  background: color-mix(in srgb, var(--p-blue-400) 15%, transparent);
  color: var(--p-blue-300);
}

:global(.app-dark) .tag--danger {
  background: color-mix(in srgb, var(--p-red-400) 15%, transparent);
  color: var(--p-red-300);
}

:global(.app-dark) .tag--warn {
  background: color-mix(in srgb, var(--p-orange-400) 15%, transparent);
  color: var(--p-orange-300);
}

:global(.app-dark) .tag--secondary {
  background: var(--p-surface-700);
}

.detail-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.detail-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
}

.detail-empty-icon {
  font-size: 2.5rem;
  opacity: 0.25;
}

.detail-empty-title {
  font-size: 1rem;
  font-weight: 600;
  opacity: 0.5;
}

.detail-empty-text {
  font-size: 0.8125rem;
  opacity: 0.6;
}
</style>
