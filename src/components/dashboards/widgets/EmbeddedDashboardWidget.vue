<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import DashboardCanvas from '@/components/dashboards/DashboardCanvas.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useDashboard } from '@/queries/useDashboardQueries'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { isContextObjectId } from '@/utils/dashboardContext'
import { useEmbedGuard, MAX_EMBED_DEPTH } from './embeddedDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const dashboardIds = computed(() => (cfg.value.dashboardObjects ?? []).filter(Boolean))

// The enclosing DashboardCanvas already added its own id to this chain.
const parentGuard = useEmbedGuard()

const depthExceeded = computed(() => parentGuard.depth >= MAX_EMBED_DEPTH)

// As in legacy: 0 or the context sentinel inherit the enclosing context object; any other id
// replaces it.
const { contextObjectId: enclosingContextId } = useDashboardContext()
const embeddedContextId = computed(() => {
  const id = Number(cfg.value.contextObjectId) || 0
  return id === 0 || isContextObjectId(id) ? enclosingContextId.value : id
})

// Rotates through the configured dashboards when displayInterval > 0
const activeIndex = ref(0)
let rotateTimer = null

function startRotation() {
  clearInterval(rotateTimer)
  rotateTimer = null
  const interval = cfg.value.displayInterval
  if (interval > 0 && dashboardIds.value.length > 1) {
    rotateTimer = setInterval(() => {
      activeIndex.value = (activeIndex.value + 1) % dashboardIds.value.length
    }, interval * 1000)
  }
}

watch([() => cfg.value.displayInterval, dashboardIds], () => {
  activeIndex.value = 0
  startRotation()
})
onMounted(startRotation)
onBeforeUnmount(() => clearInterval(rotateTimer))

const activeDashboardId = computed(() => dashboardIds.value[activeIndex.value] ?? null)
const isCycle = computed(
  () => activeDashboardId.value != null && parentGuard.visitedIds.has(activeDashboardId.value),
)

const {
  data: dashboardData,
  isLoading,
  isError,
  error,
  refetch,
} = useDashboard(
  computed(() => (isCycle.value || depthExceeded.value ? null : activeDashboardId.value)),
)
</script>

<template>
  <div class="embedded-dashboard-widget">
    <div v-if="!dashboardIds.length" class="embed-state">
      <i class="pi pi-objects-column" />
      <span>No dashboards configured</span>
    </div>
    <div v-else-if="depthExceeded" class="embed-state">
      <i class="pi pi-exclamation-triangle" />
      <span>Maximum embed depth ({{ MAX_EMBED_DEPTH }}) reached</span>
    </div>
    <div v-else-if="isCycle" class="embed-state">
      <i class="pi pi-exclamation-triangle" />
      <span>Dashboard #{{ activeDashboardId }} is already open in this embedding chain</span>
    </div>
    <div v-else-if="isLoading" class="embed-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading dashboard&hellip;</span>
    </div>
    <div v-else-if="isError" class="embed-state embed-state--error">
      <QueryErrorState :error="error" message="Failed to load dashboard" @retry="refetch" />
    </div>
    <div v-else-if="!dashboardData" class="embed-state">
      <i class="pi pi-objects-column" />
      <span>Dashboard not found</span>
    </div>
    <DashboardCanvas
      v-else
      :key="activeDashboardId"
      class="embedded-canvas"
      :dashboard="dashboardData"
      :edit-mode="false"
      :embedded="true"
      :context-object-id="embeddedContextId"
    />
  </div>
</template>

<style scoped>
.embedded-dashboard-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.embedded-canvas {
  flex: 1;
  min-height: 0;
}

.embed-state {
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

.embed-state i {
  font-size: 1.5rem;
  opacity: 0.4;
}

.embed-state--error {
  color: var(--p-red-400, #f87171);
}
</style>
