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
import ObjectTreeNode from '@/components/objects/ObjectTreeNode.vue'
import { useObjectTree, useObject } from '@/queries/useObjectQueries'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    default: 'Select Object',
  },
  /** @type {{ id: string, label: string, rootId: number }[]} */
  perspectives: {
    type: Array,
    default: () => [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }],
  },
  /**
   * Non-selectable nodes toggle expand on click.
   * @type {(node: object) => boolean}
   */
  selectable: {
    type: Function,
    default: () => true,
  },
  /**
   * Keeps nodes that match or have matching descendants, before the search text filter.
   * @type {((node: object) => boolean) | null}
   */
  displayFilter: {
    type: Function,
    default: null,
  },
  showPerspectiveRoot: {
    type: Boolean,
    default: false,
  },
  /** Ctrl+click toggles nodes; @select emits an array. */
  multiSelect: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:visible', 'select'])

const activePerspectiveId = ref(props.perspectives[0]?.id)
const activePerspective = computed(
  () => props.perspectives.find((p) => p.id === activePerspectiveId.value) ?? props.perspectives[0],
)

// Reset the perspective on close so no background subscription to its tree query remains.
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    activePerspectiveId.value = props.perspectives[0]?.id
    treeFilter.value = ''
    selectedNodes.value = []
    selectedPaths.value = new Set()
  },
)

const activeRootId = computed(() => activePerspective.value?.rootId ?? 2)
const { data: treeData, isLoading: isTreeLoading } = useObjectTree(activeRootId)
const { data: rootObjectData } = useObject(activeRootId)
const tree = computed(() => {
  const subtree = treeData.value ?? []
  if (props.showPerspectiveRoot && rootObjectData.value) {
    return [{ ...rootObjectData.value, children: subtree }]
  }
  return subtree
})

const expandedIds = ref(new Set([String(activeRootId.value)]))

watch(activeRootId, (rootId) => {
  expandedIds.value = new Set([String(rootId)])
  selectedNodes.value = []
  selectedPaths.value = new Set()
  treeFilter.value = ''
})

function toggleNode(path) {
  const next = new Set(expandedIds.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  expandedIds.value = next
}

const selectedNodes = ref([])
const selectedPaths = ref(new Set())
const treeFilter = ref('')

function onNodeClick(node, nodePath = null, event = null) {
  if (!props.selectable(node)) {
    toggleNode(nodePath ?? String(node.id))
    return
  }
  const path = nodePath ?? String(node.id)
  if (props.multiSelect && (event?.ctrlKey || event?.metaKey)) {
    const idx = selectedNodes.value.findIndex((n) => n.id === node.id)
    if (idx >= 0) {
      selectedNodes.value = selectedNodes.value.filter((_, i) => i !== idx)
      const next = new Set(selectedPaths.value)
      next.delete(path)
      selectedPaths.value = next
    } else {
      selectedNodes.value = [...selectedNodes.value, node]
      selectedPaths.value = new Set([...selectedPaths.value, path])
    }
  } else {
    selectedNodes.value = [node]
    selectedPaths.value = new Set([path])
  }
}

const CONTAINER_CLASSES = new Set([
  'Network',
  'ServiceRoot',
  'Zone',
  'Container',
  'Collector',
  'Cluster',
  'TemplateRoot',
  'TemplateGroup',
  'DashboardRoot',
  'DashboardGroup',
  'NetworkMapRoot',
  'NetworkMapGroup',
  'BusinessServiceRoot',
  'BusinessServiceGroup',
  'AssetRoot',
  'AssetGroup',
  'Rack',
  'Chassis',
])

function sortLevel(nodes) {
  return [...nodes].sort((a, b) => {
    const aRank = CONTAINER_CLASSES.has(a.class) ? 0 : 1
    const bRank = CONTAINER_CLASSES.has(b.class) ? 0 : 1
    return aRank - bRank
  })
}

function sortTreeNodes(nodes) {
  return sortLevel(nodes).map((node) =>
    node.children?.length ? { ...node, children: sortTreeNodes(node.children) } : node,
  )
}

const filteredTree = computed(() => {
  let nodes = tree.value

  if (props.displayFilter) {
    const applyDisplayFilter = (list) =>
      list.flatMap((node) => {
        const filteredChildren = applyDisplayFilter(node.children ?? [])
        if (props.displayFilter(node)) return [{ ...node, children: filteredChildren }]
        if (filteredChildren.length > 0) return [{ ...node, children: filteredChildren }]
        return []
      })
    nodes = applyDisplayFilter(nodes)
  }

  const search = treeFilter.value.toLowerCase()
  if (search) {
    function filterNode(node) {
      if ((node.name ?? '').toLowerCase().includes(search)) return node
      const children = node.children?.map(filterNode).filter(Boolean) ?? []
      if (children.length > 0) return { ...node, children }
      return null
    }
    nodes = nodes.map(filterNode).filter(Boolean)
  }

  return sortTreeNodes(nodes)
})

function onSelect() {
  if (selectedNodes.value.length === 0) return
  emit('select', props.multiSelect ? selectedNodes.value : selectedNodes.value[0])
  emit('update:visible', false)
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: '560px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <Tabs
        v-if="perspectives.length > 1"
        :value="activePerspectiveId"
        class="picker-tabs"
        @update:value="activePerspectiveId = $event"
      >
        <TabList>
          <Tab v-for="p in perspectives" :key="p.id" :value="p.id">{{ p.label }}</Tab>
        </TabList>
      </Tabs>

      <div class="picker-toolbar">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            autofocus
            v-model="treeFilter"
            data-filter-input
            placeholder="Filter objects..."
            size="small"
            class="picker-filter"
          />
        </IconField>
      </div>

      <div class="picker-tree" role="tree" aria-label="Objects">
        <div v-if="isTreeLoading" class="tree-loading">
          <Skeleton v-for="i in 6" :key="i" height="1.5rem" class="mb-1" />
        </div>
        <template v-else>
          <div v-if="filteredTree.length === 0" class="tree-empty">No objects found</div>
          <ObjectTreeNode
            v-for="node in filteredTree"
            v-else
            :key="node.id"
            :node="node"
            :depth="0"
            :selected-paths="selectedPaths"
            :parent-path="''"
            :expanded-ids="expandedIds"
            @select="(n, p, e) => onNodeClick(n, p, e)"
            @toggle="toggleNode"
            @contextmenu="() => {}"
          />
        </template>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onCancel" />
      <Button
        :label="
          multiSelect && selectedNodes.length > 1 ? `Select (${selectedNodes.length})` : 'Select'
        "
        icon="pi pi-check"
        :disabled="selectedNodes.length === 0"
        @click="onSelect"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  flex-direction: column;
  height: 520px;
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

.picker-tree {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.tree-loading {
  padding: 0.5rem;
}

.tree-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
