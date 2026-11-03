<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import LogColumnFilterCard from './LogColumnFilterCard.vue'
import { getColumnLabel, getResultColumns } from '@/utils/logColumnTypes'
import { createColumnFilter } from '@/utils/logQueryModel'

const props = defineProps({
  /** @type {import('@/utils/logQueryModel').LogColumnFilter[]} */
  filters: { type: Array, default: () => [] },
  orderBy: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:filters', 'update:orderBy'])

const addMenu = ref(null)

const columnsByName = computed(() => {
  const index = {}
  for (const column of props.columns) index[column.name] = column
  return index
})

const sortableColumns = computed(() =>
  getResultColumns(props.columns).map((column) => ({
    value: column.name,
    label: getColumnLabel(column),
  })),
)

const addableColumns = computed(() => {
  const used = new Set(props.filters.map((f) => f.column))
  return getResultColumns(props.columns)
    .filter((column) => !used.has(column.name))
    .map((column) => ({ value: column.name, label: getColumnLabel(column) }))
})

const directionOptions = [
  { value: false, label: 'Asc' },
  { value: true, label: 'Desc' },
]

function addFilter(columnName) {
  const column = columnsByName.value[columnName]
  if (!column) return
  emit('update:filters', [...props.filters, createColumnFilter(column)])
  addMenu.value = null
}

function updateFilter(index, filter) {
  const next = [...props.filters]
  if (filter.conditions.length === 0) {
    next.splice(index, 1)
  } else {
    next[index] = filter
  }
  emit('update:filters', next)
}

function removeFilter(index) {
  emit(
    'update:filters',
    props.filters.filter((_, i) => i !== index),
  )
}

function updateOrder(index, changes) {
  const next = [...props.orderBy]
  next[index] = { ...next[index], ...changes }
  emit('update:orderBy', next)
}

function addOrder() {
  const used = new Set(props.orderBy.map((o) => o.column))
  const next = sortableColumns.value.find((c) => !used.has(c.value))
  if (next) emit('update:orderBy', [...props.orderBy, { column: next.value, descending: true }])
}

function removeOrder(index) {
  emit(
    'update:orderBy',
    props.orderBy.filter((_, i) => i !== index),
  )
}
</script>

<template>
  <div class="advanced-filters">
    <div class="advanced-section">
      <div class="advanced-section-header">
        <span class="advanced-section-title">Conditions</span>
        <Select
          v-model="addMenu"
          :options="addableColumns"
          option-label="label"
          option-value="value"
          placeholder="Add column..."
          size="small"
          filter
          :disabled="addableColumns.length === 0"
          class="advanced-add"
          @update:model-value="addFilter"
        />
      </div>

      <p v-if="filters.length === 0" class="advanced-empty">
        No conditions. Add a column here for ranges, negation, and "is below" object filters, or
        type simple terms into the search box above.
      </p>

      <div v-else class="advanced-cards">
        <LogColumnFilterCard
          v-for="(filter, index) in filters"
          :key="filter.id"
          :filter="filter"
          :column="columnsByName[filter.column]"
          @update="(next) => updateFilter(index, next)"
          @remove="removeFilter(index)"
        />
      </div>
    </div>

    <div class="advanced-section">
      <div class="advanced-section-header">
        <span class="advanced-section-title">Sort</span>
        <Button
          icon="pi pi-plus"
          label="Add"
          text
          size="small"
          :disabled="orderBy.length >= sortableColumns.length"
          @click="addOrder"
        />
      </div>

      <p v-if="orderBy.length === 0" class="advanced-empty">
        Unsorted. The server returns records in database order.
      </p>

      <div v-for="(order, index) in orderBy" :key="index" class="order-row">
        <Select
          :model-value="order.column"
          :options="sortableColumns"
          option-label="label"
          option-value="value"
          size="small"
          filter
          class="order-column"
          @update:model-value="(v) => updateOrder(index, { column: v })"
        />
        <SelectButton
          :model-value="order.descending"
          :options="directionOptions"
          option-label="label"
          option-value="value"
          size="small"
          :allow-empty="false"
          @update:model-value="(v) => updateOrder(index, { descending: v })"
        />
        <Button
          icon="pi pi-times"
          severity="secondary"
          text
          size="small"
          aria-label="Remove sort column"
          @click="removeOrder(index)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.advanced-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.75rem 0 0.25rem;
}

.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.advanced-section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.advanced-section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.advanced-add {
  width: 14rem;
}

.advanced-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.advanced-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
  gap: 0.5rem;
  align-items: start;
}

.order-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.order-column {
  width: 14rem;
}
</style>
