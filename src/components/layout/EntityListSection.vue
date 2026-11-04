<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'

/**
 * A configuration section that lists entities in an AppTable and opens one on its own route.
 * Attributes and listeners not declared here go to the AppTable. A column with id `actions`
 * gets the row menu button.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps({
  /** Shows the `detail` slot; the list stays mounted so the table keeps its page and sort. */
  detail: { type: Boolean, default: false },
  title: { type: String, required: true },
  icon: { type: String, default: null },
  /** Add button label; no Add button without it. */
  addLabel: { type: String, default: null },
  filterPlaceholder: { type: String, required: true },
  /** Singular noun for the item count, e.g. "action". */
  countNoun: { type: String, required: true },
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  fetching: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  /** What an empty table says; the `empty` slot replaces it. */
  emptyText: { type: String, default: '' },
  /** `(row) => MenuItem[]` for the row context menu. */
  menuItems: { type: Function, required: true },
})

const filter = defineModel('filter', { type: Object, required: true })

const emit = defineEmits(['refresh', 'add', 'row-click'])

const skeletonColumns = computed(() =>
  props.columns.map((col) => (col.width ? `minmax(0, ${col.width}fr)` : 'minmax(0, 1fr)')),
)

const contextMenu = ref()
const menuRow = ref(null)
const menuModel = computed(() => (menuRow.value ? props.menuItems(menuRow.value) : []))

function openMenu(event, row) {
  menuRow.value = row
  contextMenu.value.show(event, row)
}
</script>

<template>
  <div v-if="detail" class="entity-section">
    <slot name="detail" />
  </div>

  <div v-show="!detail" class="entity-section">
    <SectionHeader :title="title" :icon="icon">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="emit('refresh')"
        />
        <slot name="header-actions" />
        <Button
          v-if="addLabel"
          :label="addLabel"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="emit('add')"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="fetching && !loading" />

    <div class="section-toolbar">
      <SmartFilterInput v-model="filter" :placeholder="filterPlaceholder" class="filter-input" />
      <span v-if="!loading" class="item-count">{{ $plural(rows.length, countNoun) }}</span>
      <slot name="toolbar" />
    </div>

    <slot name="before-table" />

    <div v-if="loading" class="section-loading">
      <TableSkeleton :columns="skeletonColumns" :rows="8" />
    </div>

    <AppTable
      v-else
      striped
      column-borders
      resize-fit
      :page-size="50"
      v-bind="$attrs"
      :columns="columns"
      :rows="rows"
      :error="error"
      class="entity-table"
      @row-click="emit('row-click', $event)"
      @row-contextmenu="({ event, row }) => openMenu(event, row)"
      @retry="emit('refresh')"
    >
      <template #cell="cell">
        <Button
          v-if="cell.col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="openMenu($event, cell.row)"
        />
        <slot v-else name="cell" v-bind="cell" />
      </template>
      <template #empty>
        <div class="empty-message">
          <slot name="empty">{{ emptyText }}</slot>
        </div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="menuModel" />
  </div>
</template>

<style scoped>
.entity-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.section-loading {
  padding: 1rem;
  overflow: hidden;
}

.entity-table {
  flex: 1;
  min-height: 0;
}

.entity-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
  max-width: 32rem;
  margin: 0 auto;
}
</style>
