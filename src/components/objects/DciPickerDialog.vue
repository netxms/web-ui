<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Skeleton from 'primevue/skeleton'
import ObjectTreeNode from '@/components/objects/ObjectTreeNode.vue'
import { useObjectTree, useDciCurrentValues } from '@/queries/useObjectQueries'
import { TEMPLATE_APPLICABLE_CLASSES } from '@/utils/objectUtils'

// Single mode emits one `{ object, dci }` on click; `multiple` emits an array on confirm, and
// choosing another object starts the selection over, as in legacy.
const ROOT_OBJECT_ID = 2

const props = defineProps({
  visible: { type: Boolean, required: true },
  header: { type: String, default: 'Select DCI' },
  multiple: { type: Boolean, default: false },
  /** Multiple mode. */
  confirmLabel: { type: String, default: 'Select' },
  /** Single mode. */
  hint: { type: String, default: 'Click a DCI to select it' },
})

const emit = defineEmits(['update:visible', 'select'])

const DCI_OWNER_CLASSES = new Set(TEMPLATE_APPLICABLE_CLASSES)

const { data: treeData, isLoading: isTreeLoading } = useObjectTree(ROOT_OBJECT_ID)
const tree = computed(() => treeData.value ?? [])

const expandedIds = ref(new Set([String(ROOT_OBJECT_ID)]))
const selectedObject = ref(null)
const selectedPath = ref(null)
const treeFilter = ref('')

function toggleNode(path) {
  const next = new Set(expandedIds.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  expandedIds.value = next
}

function selectObject(node, nodePath = null) {
  if (!DCI_OWNER_CLASSES.has(node.class)) {
    toggleNode(nodePath ?? String(node.id))
    return
  }
  selectedObject.value = node
  selectedPath.value = nodePath
  dciFilter.value = ''
  selectedDciIds.value = new Set()
}

const filteredTree = computed(() => {
  const search = treeFilter.value.toLowerCase()
  if (!search) return tree.value
  function filterNode(node) {
    if ((node.name ?? '').toLowerCase().includes(search)) return node
    const children = node.children?.map(filterNode).filter(Boolean) ?? []
    if (children.length > 0) return { ...node, children }
    return null
  }
  return tree.value.map(filterNode).filter(Boolean)
})

const dciFilter = ref('')
const selectedObjectId = computed(() => selectedObject.value?.id ?? null)
const { data: dcisData, isLoading: isDciLoading } = useDciCurrentValues(selectedObjectId)
const dcis = computed(() => dcisData.value?.values ?? [])
const filteredDcis = computed(() => {
  if (!dciFilter.value) return dcis.value
  const search = dciFilter.value.toLowerCase()
  return dcis.value.filter(
    (dci) =>
      (dci.description ?? '').toLowerCase().includes(search) ||
      (dci.name ?? '').toLowerCase().includes(search),
  )
})

const selectedDciIds = ref(new Set())

watch(
  () => props.visible,
  (visible) => {
    if (visible) selectedDciIds.value = new Set()
  },
)

function pickedEntry(dci) {
  return { object: selectedObject.value, dci }
}

function onDciClick(dci) {
  if (!props.multiple) {
    emit('select', pickedEntry(dci))
    emit('update:visible', false)
    return
  }
  const next = new Set(selectedDciIds.value)
  if (next.has(dci.id)) next.delete(dci.id)
  else next.add(dci.id)
  selectedDciIds.value = next
}

function confirm() {
  const picked = dcis.value.filter((dci) => selectedDciIds.value.has(dci.id)).map(pickedEntry)
  if (picked.length === 0) return
  emit('select', picked)
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :style="{ width: '1020px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <div class="tree-panel">
        <div class="panel-toolbar">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              autofocus
              v-model="treeFilter"
              data-filter-input
              placeholder="Filter objects..."
              size="small"
              class="panel-filter"
            />
          </IconField>
        </div>
        <div class="tree-scroll" role="tree" aria-label="Objects">
          <div v-if="isTreeLoading" class="panel-loading">
            <Skeleton v-for="i in 6" :key="i" height="1.5rem" class="mb-1" />
          </div>
          <ObjectTreeNode
            v-for="node in filteredTree"
            v-else
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-path="selectedPath"
            :parent-path="''"
            :expanded-ids="expandedIds"
            @select="(n, p) => selectObject(n, p)"
            @contextmenu="() => {}"
            @toggle="toggleNode"
          />
        </div>
      </div>

      <div class="dci-panel">
        <div class="panel-toolbar">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText
              v-model="dciFilter"
              data-filter-input
              placeholder="Filter DCIs..."
              size="small"
              class="panel-filter"
              :disabled="!selectedObject"
            />
          </IconField>
        </div>
        <div class="dci-scroll">
          <div v-if="!selectedObject" class="panel-empty">Select an object from the tree</div>
          <div v-else-if="isDciLoading" class="panel-loading">
            <Skeleton v-for="i in 5" :key="i" height="1.75rem" class="mb-1" />
          </div>
          <div v-else-if="filteredDcis.length === 0" class="panel-empty">No DCIs found</div>
          <button
            type="button"
            v-for="dci in filteredDcis"
            v-else
            :key="dci.id"
            class="dci-row"
            :class="{ 'dci-row--selected': selectedDciIds.has(dci.id) }"
            :aria-pressed="multiple ? selectedDciIds.has(dci.id) : undefined"
            @click="onDciClick(dci)"
          >
            <i
              v-if="multiple"
              class="pi dci-check"
              :class="selectedDciIds.has(dci.id) ? 'pi-check-square' : 'pi-stop'"
              aria-hidden="true"
            />
            <span class="dci-text">
              <span class="dci-description">{{ dci.description || dci.name }}</span>
              <span class="dci-name">{{ dci.name }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <span v-if="multiple" class="footer-hint"
        >{{ $plural(selectedDciIds.size, 'DCI') }} selected</span
      >
      <span v-else class="footer-hint">{{ hint }}</span>
      <Button label="Cancel" severity="secondary" size="small" @click="close" />
      <Button
        v-if="multiple"
        :label="confirmLabel"
        icon="pi pi-check"
        size="small"
        :disabled="selectedDciIds.size === 0"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  height: 550px;
  overflow: hidden;
  margin: -1.25rem;
  margin-top: 0;
}

.tree-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-surface-border);
}

.dci-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.panel-toolbar {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.panel-filter {
  width: 100%;
}

.tree-scroll,
.dci-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.panel-loading {
  padding: 0.5rem;
}

.panel-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.dci-row {
  /* A <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  border-bottom: 1px solid var(--p-surface-border);
}

.dci-row:hover {
  background: var(--p-surface-hover);
}

.dci-row--selected {
  background: var(--p-highlight-background);
}

.dci-row:last-child {
  border-bottom: none;
}

.dci-check {
  color: var(--p-primary-color);
  flex-shrink: 0;
}

.dci-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.dci-description {
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.dci-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.footer-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: auto;
  align-self: center;
}
</style>
