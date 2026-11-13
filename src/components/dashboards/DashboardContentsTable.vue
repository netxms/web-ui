<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import StatusTag from '@/components/common/StatusTag.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import AppLink from '@/components/common/AppLink.vue'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'
import DashboardThumbnail from './DashboardThumbnail.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyIcon: { type: String, default: 'pi pi-folder-open' },
  emptyText: { type: String, default: 'Nothing here' },
  /**
   * Turns the name into a real link and makes ctrl/cmd+click open a new tab.
   * @type {import('vue').PropType<(row: object) => object>}
   */
  targetFor: { type: Function, default: null },
  /** Map<dashboardId, dashboard> from useDashboardsByIds; only Dashboard-class rows use it. */
  dashboardsById: { type: Object, default: null },
  thumbnailsLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['row-click'])

function handleRowClick(event) {
  // A modified click on the name link is left to the browser.
  const target = props.targetFor?.(event.data)
  if (target && shouldOpenInNewTab(event.originalEvent)) {
    openInNewTab(target)
    return
  }
  emit('row-click', event.data)
}
</script>

<template>
  <InfoCard :title="title">
    <DataTable
      v-if="items.length > 0"
      :value="items"
      data-key="id"
      class="contents-table"
      @row-click="handleRowClick"
    >
      <Column v-if="dashboardsById" header="" style="width: 7rem">
        <template #body="{ data }">
          <div class="thumb-cell">
            <DashboardThumbnail
              v-if="data.class === 'Dashboard'"
              :widgets="dashboardsById.get(data.id)?.widgets ?? null"
              :cols="dashboardsById.get(data.id)?.cols ?? 12"
              :loading="thumbnailsLoading && !dashboardsById.has(data.id)"
            />
            <ObjectIcon v-else :object="data" class="folder-icon" />
          </div>
        </template>
      </Column>
      <Column field="name" header="Name">
        <template #body="{ data }">
          <span class="row-name">
            <AppLink v-if="targetFor" :to="targetFor(data)">{{ data.name }}</AppLink>
            <template v-else>{{ data.name }}</template>
          </span>
        </template>
      </Column>
      <Column field="class" header="Type" style="width: 10rem" />
      <Column field="status" header="Status" style="width: 7rem">
        <template #body="{ data }">
          <StatusTag :status="data.status" />
        </template>
      </Column>
    </DataTable>
    <div v-else class="empty-contents">
      <i :class="emptyIcon" />
      <span>{{ emptyText }}</span>
    </div>
  </InfoCard>
</template>

<style scoped>
.contents-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}

.row-name {
  font-size: 0.875rem;
}

.thumb-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-icon {
  font-size: 1.25rem;
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

.empty-contents {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.empty-contents i {
  font-size: 1.5rem;
  opacity: 0.4;
}
</style>
