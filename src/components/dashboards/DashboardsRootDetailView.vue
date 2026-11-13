<script setup>
import { ref, computed, provide } from 'vue'
import Button from 'primevue/button'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import DashboardsRootStatusView from './DashboardsRootStatusView.vue'
import PropertiesView from '@/views/objects/subviews/PropertiesView.vue'
import { useObject } from '@/queries/useObjectQueries'
import { useViewStore } from '@/stores/viewStore'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { getClassIconColor, getStatusInfo } from '@/utils/objectUtils'

const PERSPECTIVE_ID = 'dashboard-root'
const DEFAULT_VIEW_IDS = ['status', 'properties']
const VIEWS = [
  { id: 'status', label: 'Status', icon: 'pi pi-info-circle' },
  { id: 'properties', label: 'Properties', icon: 'pi pi-cog' },
]

const props = defineProps({
  /** The full loaded dashboard tree */
  tree: { type: Array, required: true },
  rootId: { type: [Number, String], required: true },
})

const emit = defineEmits(['create-dashboard', 'create-group'])

const rootIdRef = computed(() => props.rootId)
const { data: rootObject, refetch: refetchRootObject } = useObject(rootIdRef)

const iconObject = computed(() => rootObject.value ?? { class: 'DashboardRoot' })
const iconColor = computed(() => getClassIconColor(rootObject.value?.class ?? 'DashboardRoot'))
const statusInfo = computed(() => getStatusInfo(rootObject.value?.status ?? 0))
const showStatusDot = computed(() => {
  const s = rootObject.value?.status
  return s != null && s !== 0 && s !== 6 && s !== 7
})
const name = computed(() => rootObject.value?.name ?? 'Dashboards')

const viewStore = useViewStore()
const visibleViewIds = computed(() => viewStore.getVisibleViewIds(PERSPECTIVE_ID, DEFAULT_VIEW_IDS))
const activeView = computed(() => viewStore.getActiveView(PERSPECTIVE_ID, 'status'))

function handleViewSelect(viewId) {
  viewStore.setActiveView(PERSPECTIVE_ID, viewId)
}

function handleViewReorder(reordered) {
  viewStore.setViewOrder(PERSPECTIVE_ID, reordered)
}

const refreshSignal = ref(0)
provide('viewRefreshSignal', refreshSignal)

function handleRefresh() {
  refetchRootObject()
  refreshSignal.value++
}

const activeViewComponent = computed(() =>
  activeView.value === 'properties' ? PropertiesView : DashboardsRootStatusView,
)

const activeViewProps = computed(() =>
  activeView.value === 'properties'
    ? { object: rootObject.value }
    : { tree: props.tree, object: rootObject.value },
)
</script>

<template>
  <div class="group-detail">
    <div class="group-detail-header">
      <ObjectIcon
        :object="iconObject"
        class="group-icon"
        :size="18"
        :style="{ color: iconColor }"
      />
      <span class="group-name">{{ name }}</span>
      <span
        v-if="showStatusDot"
        class="group-status-dot"
        :style="{ background: statusInfo.color, '--status-color': statusInfo.color }"
      />
      <div class="group-header-actions">
        <Button
          label="Create Dashboard"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          text
          @click="rootObject && emit('create-dashboard', rootObject)"
        />
        <Button
          label="Create Group"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          text
          @click="rootObject && emit('create-group', rootObject)"
        />
      </div>
    </div>

    <ViewTabBar
      :views="VIEWS"
      :visible-view-ids="visibleViewIds"
      :active-view="activeView"
      :allow-add-remove="false"
      @select="handleViewSelect"
      @reorder="handleViewReorder"
      @refresh="handleRefresh"
    />

    <ViewContainer
      v-if="rootObject"
      :component="activeViewComponent"
      :view-props="activeViewProps"
    />
  </div>
</template>

<style scoped>
.group-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.group-detail-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.group-icon {
  flex-shrink: 0;
}

.group-name {
  font-weight: 600;
  font-size: 0.9375rem;
}

.group-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-header-actions {
  margin-left: auto;
  display: flex;
  gap: 0.25rem;
}
</style>
