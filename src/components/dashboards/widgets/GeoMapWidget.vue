<script setup>
import { computed } from 'vue'
import GeoMapCanvas from '@/components/network-maps/GeoMapCanvas.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObjectSubTree, useObjectsByIds } from '@/queries/useObjectQueries'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const effectiveRootId = useEffectiveObjectId(() => props.widget.config?.rootObjectId)
const rootObjectId = computed(() => effectiveRootId.value || null)

const { data: subTree, isLoading, isError, error, refetch } = useObjectSubTree(rootObjectId)

// Sub-tree nodes carry no geolocation, so full objects are resolved by id in a batch.
function collectIds(nodes) {
  const ids = []
  for (const node of nodes ?? []) {
    ids.push(node.id)
    if (node.children?.length) ids.push(...collectIds(node.children))
  }
  return ids
}

const descendantIds = computed(() => collectIds(subTree.value))
const { objectsById } = useObjectsByIds(descendantIds)

const mapData = computed(() => {
  const elements = []
  for (const id of descendantIds.value) {
    const obj = objectsById.value.get(id)
    if (!obj?.geoLocation || obj.geoLocation.type === 0) continue
    elements.push({
      id: String(id),
      type: 'object',
      objectId: obj.id,
      objectName: obj.name,
      objectClass: obj.class,
      objectStatus: obj.status,
      geolocation: { lat: obj.geoLocation.latitude, lng: obj.geoLocation.longitude },
    })
  }
  return { elements, links: [] }
})

const hasLocatedObjects = computed(() => mapData.value.elements.length > 0)
</script>

<template>
  <div class="geo-map-widget">
    <div v-if="!rootObjectId" class="geo-state">
      <i class="pi pi-map-marker" />
      <span>No root object configured</span>
    </div>
    <div v-else-if="isLoading" class="geo-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="geo-state geo-state--error">
      <QueryErrorState :error="error" message="Failed to load objects" @retry="refetch" />
    </div>
    <div v-else-if="!hasLocatedObjects" class="geo-state">
      <i class="pi pi-map-marker" />
      <span>No objects with a location found under this object</span>
    </div>
    <div v-else class="geo-canvas-wrap">
      <GeoMapCanvas :map-data="mapData" />
    </div>
  </div>
</template>

<style scoped>
.geo-map-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.geo-canvas-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.geo-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  text-align: center;
  padding: 1rem;
}

.geo-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.geo-state--error {
  color: var(--p-red-400, #f87171);
}
</style>
