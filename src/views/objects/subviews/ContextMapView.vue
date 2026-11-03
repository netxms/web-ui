<script setup>
/** Read-only, and the zoom is not saved, as in legacy. */
import AppLink from '@/components/common/AppLink.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import NetworkMapCanvas from '@/components/network-maps/NetworkMapCanvas.vue'
import { useNetworkMap } from '@/queries/useNetworkMapQueries'
import { mapTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
  mapId: { type: Number, required: true },
})

const { data: mapData, isLoading, error, refetch } = useNetworkMap(() => props.mapId)
</script>

<template>
  <div class="context-map-view">
    <div class="context-view-toolbar">
      <span class="context-view-toolbar__title">
        <i class="pi pi-map" />
        <span class="context-view-toolbar__name">{{ mapData?.name ?? '' }}</span>
      </span>
      <div class="context-view-toolbar__spacer" />
      <AppLink :to="mapTarget(mapId)" class="context-view-toolbar__link">Open map</AppLink>
    </div>

    <LoadingState v-if="isLoading" />
    <div v-else-if="error" class="context-view-state">
      <QueryErrorState :error="error" message="Failed to load map" @retry="refetch" />
    </div>
    <div v-else-if="mapData" class="context-view-canvas">
      <NetworkMapCanvas :map-data="mapData" :draggable="false" />
    </div>
  </div>
</template>

<style scoped>
.context-map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.context-view-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  flex-shrink: 0;
}

.context-view-toolbar__title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.context-view-toolbar__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-view-toolbar__spacer {
  flex: 1;
}

.context-view-toolbar__link {
  flex-shrink: 0;
  font-size: 0.8125rem;
}

.context-view-canvas {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.context-view-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}
</style>
