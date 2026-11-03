<script setup>
import { computed } from 'vue'
import { getStatusInfo } from '@/utils/objectUtils'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { flattenUnique, sortStatusMapObjects } from '@/utils/statusMapObjects'
import { useNavTarget } from '@/composables/useNavTarget'

const props = defineProps({
  tree: { type: Array, required: true },
  /** @type {import('vue').PropType<(objectId: number) => object>} */
  targetFor: { type: Function, default: null },
  sortBy: { type: String, default: 'status' },
})

const emit = defineEmits(['navigate'])

const { navBindings } = useNavTarget()

function tileBindings(objectId) {
  return navBindings(props.targetFor?.(objectId) ?? null, () => emit('navigate', objectId))
}

const flatObjects = computed(() => sortStatusMapObjects(flattenUnique(props.tree), props.sortBy))
</script>

<template>
  <div class="status-map-flat">
    <div class="flat-grid">
      <div
        v-for="obj in flatObjects"
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
</template>

<style scoped>
.status-map-flat {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.flat-grid {
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
