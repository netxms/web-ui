<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Skeleton from 'primevue/skeleton'
import Tabs from 'primevue/tabs'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import ObjectIcon from './ObjectIcon.vue'
import { useObjects, useObjectTree } from '@/queries/useObjectQueries'

const props = defineProps({
  visible: { type: Boolean, required: true },
})
const emit = defineEmits(['update:visible', 'select'])

const activeTab = ref('maps')
const search = ref('')
const selectedItem = ref(null)

// Discover NetworkMapRoot and DashboardRoot IDs from the flat top-level list
const { data: rootObjects, isLoading: rootsLoading } = useObjects()

const mapsRootId = computed(
  () => rootObjects.value?.find((o) => o.class === 'NetworkMapRoot')?.id ?? null,
)
const dashboardsRootId = computed(
  () => rootObjects.value?.find((o) => o.class === 'DashboardRoot')?.id ?? null,
)

// Fetch sub-trees (each query is enabled only once its root ID is known)
const { data: mapsTree, isLoading: mapsLoading } = useObjectTree(mapsRootId)
const { data: dashboardsTree, isLoading: dashboardsLoading } = useObjectTree(dashboardsRootId)

const isLoading = computed(() => rootsLoading.value || mapsLoading.value || dashboardsLoading.value)

// Sub-trees may be nested when there are group folders — flatten to get leaf objects
function flattenTree(nodes) {
  const result = []
  for (const node of nodes ?? []) {
    result.push(node)
    if (node.children?.length) result.push(...flattenTree(node.children))
  }
  return result
}

const networkMaps = computed(() => {
  const q = search.value.trim().toLowerCase()
  return flattenTree(mapsTree.value)
    .filter((o) => o.class === 'NetworkMap' && (!q || o.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const dashboards = computed(() => {
  const q = search.value.trim().toLowerCase()
  return flattenTree(dashboardsTree.value)
    .filter((o) => o.class === 'Dashboard' && (!q || o.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const currentList = computed(() =>
  activeTab.value === 'maps' ? networkMaps.value : dashboards.value,
)

function switchTab(tab) {
  activeTab.value = tab
  selectedItem.value = null
}

function onItemClick(obj) {
  selectedItem.value = obj
}

function onSelect() {
  if (!selectedItem.value) return
  emit('select', selectedItem.value)
  emit('update:visible', false)
}

function onCancel() {
  emit('update:visible', false)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      search.value = ''
      activeTab.value = 'maps'
      selectedItem.value = null
    }
  },
)
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Drilldown Object"
    modal
    :style="{ width: '480px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <Tabs :value="activeTab" class="picker-tabs" @update:value="switchTab">
        <TabList>
          <Tab value="maps">Network Maps</Tab>
          <Tab value="dashboards">Dashboards</Tab>
        </TabList>
      </Tabs>

      <div class="picker-toolbar">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            autofocus
            v-model="search"
            data-filter-input
            placeholder="Filter..."
            size="small"
            class="picker-filter"
          />
        </IconField>
      </div>

      <div class="picker-list">
        <div v-if="isLoading" class="list-loading">
          <Skeleton v-for="i in 6" :key="i" height="2rem" class="mb-1" />
        </div>
        <template v-else>
          <div v-if="currentList.length === 0" class="list-empty">No objects found</div>
          <button
            v-for="obj in currentList"
            :key="obj.id"
            type="button"
            class="list-item"
            :class="{ selected: selectedItem?.id === obj.id }"
            :aria-pressed="selectedItem?.id === obj.id"
            @click="onItemClick(obj)"
          >
            <ObjectIcon :object="obj" class="list-item-icon" />
            <span class="list-item-name">{{ obj.name }}</span>
          </button>
        </template>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button label="Select" icon="pi pi-check" :disabled="!selectedItem" @click="onSelect" />
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  flex-direction: column;
  height: 360px;
  margin: -1.25rem;
  margin-top: 0;
  overflow: hidden;
}

.picker-tabs {
  flex-shrink: 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.picker-tabs :deep(.p-tablist) {
  border-bottom: none;
}

.picker-toolbar {
  flex-shrink: 0;
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.picker-filter {
  width: 100%;
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.list-loading {
  padding: 0.5rem;
}

.list-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.list-item {
  /* Now a <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.list-item:hover {
  background: var(--p-surface-hover);
}

.list-item.selected {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.list-item-icon {
  font-size: 0.875rem;
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}

.list-item-name {
  flex: 1;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
