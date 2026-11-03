<script setup>
import { computed } from 'vue'
import { getStatusInfo } from '@/utils/objectUtils'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { useNavTarget } from '@/composables/useNavTarget'

const CONTAINER_CLASSES = new Set(['Container', 'Collector', 'Cluster', 'Subnet'])

const props = defineProps({
  tree: { type: Array, required: true },
  /** @type {import('vue').PropType<(objectId: number) => object>} */
  targetFor: { type: Function, default: null },
  rootName: { type: String, default: '' },
})

const emit = defineEmits(['navigate'])

const { navBindings } = useNavTarget()

function tileBindings(objectId) {
  return navBindings(props.targetFor?.(objectId) ?? null, () => emit('navigate', objectId))
}

function worstStatus(nodes) {
  let worst = 0
  for (const node of nodes) {
    if ((node.status ?? 0) > worst) worst = node.status
  }
  return worst
}

function collectGroups(nodes, pathSegments) {
  const groups = []
  const leafNodes = []

  for (const node of nodes) {
    if (CONTAINER_CLASSES.has(node.class) && node.children?.length) {
      const segment = { id: node.id, name: node.name, class: node.class, category: node.category }
      groups.push(...collectGroups(node.children, [...pathSegments, segment]))
    } else {
      leafNodes.push(node)
    }
  }

  if (leafNodes.length) {
    groups.unshift({
      id: pathSegments.length ? pathSegments.map((s) => s.id).join('/') : 'ungrouped',
      pathSegments,
      name: pathSegments.map((s) => s.name).join(' / ') || props.rootName || 'Direct children',
      status: worstStatus(leafNodes),
      children: leafNodes,
    })
  }

  return groups
}

const groups = computed(() => {
  const result = collectGroups(props.tree, [])
  return result.sort((a, b) => {
    if (a.id === 'ungrouped') return -1
    if (b.id === 'ungrouped') return 1
    return a.name.localeCompare(b.name)
  })
})
</script>

<template>
  <div class="status-map-grouped">
    <div v-for="group in groups" :key="group.id" class="group-section">
      <div class="group-header">
        <span v-if="!group.pathSegments.length" class="group-path-label">{{ group.name }}</span>
        <template v-else>
          <template v-for="(seg, i) in group.pathSegments" :key="seg.id">
            <span v-if="i > 0" class="group-path-sep">/</span>
            <ObjectIcon :object="seg" class="group-icon" />
            <span class="group-path-link" v-bind="tileBindings(seg.id)">
              {{ seg.name }}
            </span>
          </template>
        </template>
        <span class="group-spacer" />
        <span class="group-status-dot" :style="{ background: getStatusInfo(group.status).color }" />
        <span class="group-count">{{ group.children.length }}</span>
      </div>
      <div class="group-grid">
        <div
          v-for="obj in group.children"
          :key="obj.id"
          class="status-tile"
          :style="{
            '--tile-bg': getStatusInfo(obj.status).bgColor,
            '--tile-border': getStatusInfo(obj.status).color,
            '--tile-text': getStatusInfo(obj.status).textColor,
          }"
          v-bind="tileBindings(obj.id)"
        >
          <ObjectIcon :object="obj" :inactive="obj.status === 6" class="tile-icon" />
          <span class="tile-name">{{ obj.name }}</span>
          <span class="tile-status">{{ getStatusInfo(obj.status).label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-map-grouped {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
  border-bottom: 1px solid var(--p-surface-200);
  margin-bottom: 0.5rem;
}

.group-path-label {
  flex: 1;
}

.group-path-link {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.group-path-link:hover {
  text-decoration: underline;
}

.group-path-sep {
  color: var(--p-text-muted-color);
  margin: 0 0.125rem;
  font-weight: 400;
}

.group-icon {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.group-spacer {
  flex: 1;
}

.group-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-weight: 400;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.5rem;
}

.status-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  background: var(--tile-bg);
  border-left: 3px solid var(--tile-border);
  color: var(--tile-text);
  cursor: pointer;
  transition:
    transform 0.1s,
    box-shadow 0.1s;
  min-height: 60px;
}

.status-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tile-icon {
  font-size: 0.75rem;
  opacity: 0.7;
}

.tile-name {
  font-size: 0.8125rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-status {
  font-size: 0.6875rem;
  opacity: 0.8;
}
</style>
