<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import LogConditionRow from './LogConditionRow.vue'
import { getColumnLabel } from '@/utils/logColumnTypes'
import { createCondition, describeCondition } from '@/utils/logQueryModel'

// The server ANDs top-level filters and offers OR only inside one column's `set`, so any/all
// lives on the card.
const props = defineProps({
  filter: { type: Object, required: true },
  column: { type: Object, required: true },
})

const emit = defineEmits(['update', 'remove'])

const label = computed(() => getColumnLabel(props.column))

const matchOptions = [
  { value: 'or', label: 'any' },
  { value: 'and', label: 'all' },
]

function patch(changes) {
  emit('update', { ...props.filter, ...changes })
}

function updateCondition(index, condition) {
  const conditions = [...props.filter.conditions]
  conditions[index] = condition
  patch({ conditions })
}

function removeCondition(index) {
  patch({ conditions: props.filter.conditions.filter((_, i) => i !== index) })
}

function addCondition() {
  patch({ conditions: [...props.filter.conditions, createCondition(props.column)] })
}
</script>

<template>
  <section class="filter-card" :class="{ 'filter-card--locked': filter.locked }">
    <header class="filter-card-header">
      <span class="filter-card-title">{{ label }}</span>

      <template v-if="filter.locked">
        <span class="filter-card-lock">
          <i class="pi pi-lock" />
          Set by this view
        </span>
      </template>
      <template v-else>
        <span v-if="filter.conditions.length > 1" class="filter-card-match">
          match
          <SelectButton
            :model-value="filter.operation"
            :options="matchOptions"
            option-label="label"
            option-value="value"
            size="small"
            :allow-empty="false"
            @update:model-value="(v) => patch({ operation: v })"
          />
        </span>
        <Button
          icon="pi pi-times"
          severity="secondary"
          text
          size="small"
          aria-label="Remove filter"
          @click="emit('remove')"
        />
      </template>
    </header>

    <div class="filter-card-body">
      <template v-if="filter.locked">
        <p v-for="condition in filter.conditions" :key="condition.id" class="filter-card-readonly">
          {{ describeCondition(condition, column) }}
        </p>
      </template>
      <template v-else>
        <LogConditionRow
          v-for="(condition, index) in filter.conditions"
          :key="condition.id"
          :condition="condition"
          :column="column"
          :removable="filter.conditions.length > 1"
          @update="(next) => updateCondition(index, next)"
          @remove="removeCondition(index)"
        />
        <Button
          icon="pi pi-plus"
          label="Condition"
          text
          size="small"
          class="filter-card-add"
          @click="addCondition"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.filter-card {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
}

.filter-card--locked {
  background: var(--p-surface-ground);
}

.filter-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.filter-card-title {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-card-match {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.filter-card-lock {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  padding-right: 0.5rem;
}

.filter-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem 0.625rem;
}

.filter-card-readonly {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.filter-card-add {
  align-self: flex-start;
}
</style>
