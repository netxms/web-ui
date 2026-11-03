<script setup>
import { computed } from 'vue'
import NetworkMapCanvas from '@/components/network-maps/NetworkMapCanvas.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useNetworkMap } from '@/queries/useNetworkMapQueries'

const props = defineProps({
  widget: { type: Object, required: true },
})

const mapId = computed(() => props.widget.config?.mapId ?? null)
const { data: mapData, isLoading, isError, error, refetch } = useNetworkMap(mapId)
</script>

<template>
  <div class="network-map-widget">
    <div v-if="!mapId" class="map-state">
      <i class="pi pi-map" />
      <span>No map configured</span>
    </div>
    <div v-else-if="isLoading" class="map-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading map&hellip;</span>
    </div>
    <div v-else-if="isError" class="map-state map-state--error">
      <QueryErrorState :error="error" message="Failed to load map" @retry="refetch" />
    </div>
    <div v-else-if="!mapData" class="map-state">
      <i class="pi pi-map" />
      <span>Map not found</span>
    </div>
    <div v-else class="map-canvas-wrap">
      <NetworkMapCanvas :map-data="mapData" :draggable="false" />
    </div>
  </div>
</template>

<style scoped>
.network-map-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.map-canvas-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.map-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.map-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.map-state--error {
  color: var(--p-red-400, #f87171);
}

.map-state--error i {
  opacity: 0.6;
}
</style>
