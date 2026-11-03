<script setup>
/**
 * Widgets set to the context object, and charts with template DCIs, follow the object the tab
 * is on. Read-only, as in legacy.
 */
import AppLink from '@/components/common/AppLink.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import DashboardCanvas from '@/components/dashboards/DashboardCanvas.vue'
import { useDashboard } from '@/queries/useDashboardQueries'
import { dashboardTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
  dashboardId: { type: Number, required: true },
})

const { data: dashboard, isLoading, error, refetch } = useDashboard(() => props.dashboardId)
</script>

<template>
  <div class="context-dashboard-view">
    <div class="context-view-toolbar">
      <span class="context-view-toolbar__title">
        <i class="pi pi-th-large" />
        <span class="context-view-toolbar__name">{{ dashboard?.name ?? '' }}</span>
      </span>
      <div class="context-view-toolbar__spacer" />
      <AppLink :to="dashboardTarget(dashboardId)" class="context-view-toolbar__link">
        Open in Dashboards
      </AppLink>
    </div>

    <LoadingState v-if="isLoading" />
    <div v-else-if="error" class="context-view-state">
      <QueryErrorState :error="error" message="Failed to load dashboard" @retry="refetch" />
    </div>
    <DashboardCanvas
      v-else-if="dashboard"
      class="context-view-canvas"
      :dashboard="dashboard"
      :context-object-id="object.id"
      embedded
    />
  </div>
</template>

<style scoped>
.context-dashboard-view {
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
}

.context-view-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}
</style>
