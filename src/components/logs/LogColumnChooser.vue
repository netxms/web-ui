<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Popover from 'primevue/popover'
import { getColumnLabel } from '@/utils/logColumnTypes'

const props = defineProps({
  /** Result columns only; detail columns never appear in a table. */
  columns: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const popover = ref(null)
const pending = ref([])

const allSelected = computed(() => pending.value.length === props.columns.length)
const someSelected = computed(
  () => pending.value.length > 0 && pending.value.length < props.columns.length,
)

function toggle(event) {
  pending.value = [...props.modelValue]
  popover.value.toggle(event)
}

function toggleColumn(name) {
  pending.value = pending.value.includes(name)
    ? pending.value.filter((n) => n !== name)
    : [...pending.value, name]
}

function toggleAll() {
  pending.value = allSelected.value ? [] : props.columns.map((c) => c.name)
}

function apply() {
  // Emit in schema order so hiding then re-showing a column puts it back where it was.
  emit(
    'update:modelValue',
    props.columns.filter((c) => pending.value.includes(c.name)).map((c) => c.name),
  )
  popover.value.hide()
}

defineExpose({ toggle })
</script>

<template>
  <Button
    icon="pi pi-table"
    :label="`Columns (${modelValue.length})`"
    size="small"
    severity="secondary"
    outlined
    @click="toggle"
  />

  <Popover ref="popover">
    <div class="column-chooser">
      <label class="column-chooser-all">
        <Checkbox
          :model-value="allSelected"
          :indeterminate="someSelected"
          binary
          @change="toggleAll"
        />
        Show all / hide all
      </label>

      <div class="column-chooser-list">
        <label v-for="column in columns" :key="column.name" class="column-chooser-option">
          <Checkbox
            :model-value="pending.includes(column.name)"
            binary
            @change="toggleColumn(column.name)"
          />
          {{ getColumnLabel(column) }}
        </label>
      </div>

      <div class="column-chooser-footer">
        <Button label="Cancel" size="small" severity="secondary" text @click="popover.hide()" />
        <Button label="Apply" size="small" :disabled="pending.length === 0" @click="apply" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.column-chooser {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 14rem;
}

.column-chooser-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.column-chooser-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 22rem;
  overflow-y: auto;
}

.column-chooser-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.column-chooser-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}
</style>
