<script setup>
import { ref, computed, provide } from 'vue'
import Button from 'primevue/button'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import DashboardGroupStatusView from './DashboardGroupStatusView.vue'
import PropertiesView from '@/views/objects/subviews/PropertiesView.vue'
import { useObject } from '@/queries/useObjectQueries'
import { useViewStore } from '@/stores/viewStore'
import { getClassIconComponent, getClassIconColor, getStatusInfo } from '@/utils/objectUtils'

const PERSPECTIVE_ID = 'dashboard-group'
const DEFAULT_VIEW_IDS = ['status', 'properties']
const VIEWS = [
  { id: 'status', label: 'Status', icon: 'pi pi-info-circle' },
  { id: 'properties', label: 'Properties', icon: 'pi pi-cog' },
]

const props = defineProps({
  /** Tree node; .children are populated from the loaded dashboard tree */
  node: { type: Object, required: true },
})

const emit = defineEmits(['create-dashboard', 'create-group'])

const groupId = computed(() => props.node.id)
const { data: groupObject, refetch: refetchGroupObject } = useObject(groupId)

const iconComponent = computed(() => getClassIconComponent('DashboardGroup'))
const iconColor = computed(() => getClassIconColor('DashboardGroup'))
const statusInfo = computed(() => getStatusInfo(props.node.status ?? 0))
const showStatusDot = computed(() => {
  const s = props.node.status
  return s != null && s !== 0 && s !== 6 && s !== 7
})

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
  refetchGroupObject()
  refreshSignal.value++
}

const activeViewComponent = computed(() =>
  activeView.value === 'properties' ? PropertiesView : DashboardGroupStatusView,
)

const activeViewProps = computed(() =>
  activeView.value === 'properties'
    ? { object: groupObject.value }
    : { node: props.node, object: groupObject.value },
)
</script>

<template>
  <div class="group-detail">
    <div class="group-detail-header">
      <component
        :is="iconComponent"
        class="group-icon"
        :size="18"
        :stroke-width="1.75"
        :style="{ color: iconColor }"
      />
      <span class="group-name">{{ node.name }}</span>
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
          @click="emit('create-dashboard', node)"
        />
        <Button
          label="Create Group"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          text
          @click="emit('create-group', node)"
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
      v-if="groupObject"
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
