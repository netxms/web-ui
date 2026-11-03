<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import StatusTag from '@/components/common/StatusTag.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import AppLink from '@/components/common/AppLink.vue'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  emptyIcon: { type: String, default: 'pi pi-folder-open' },
  emptyText: { type: String, default: 'Nothing here' },
  /** @type {import('vue').PropType<(row: object) => object>} */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['row-click'])

function handleRowClick(event) {
  // The name cell is a real link: the browser handles a modified click.
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
      <Column field="name" header="Name">
        <template #body="{ data }">
          <span class="row-name">
            <ObjectIcon :object="data" :inactive="data.status === 6" />
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
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
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
