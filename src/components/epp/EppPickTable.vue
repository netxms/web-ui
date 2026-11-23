<script setup>
import { useId } from 'vue'
import Button from 'primevue/button'

defineOptions({ name: 'EppPickTable' })

defineProps({
  /** `{ key, label }[]`; the `item` slot draws a row from one. */
  items: { type: Array, required: true },
  column: { type: String, required: true },
  /** The row an empty list shows, saying what it matches ("Any event"). */
  emptyText: { type: String, required: true },
  addLabel: { type: String, required: true },
  addIcon: { type: String, default: 'pi pi-plus' },
  /** One row, for the remove buttons' accessible names ("Remove event SYS_IF_UP"). */
  itemName: { type: String, required: true },
  title: { type: String, default: '' },
  mono: { type: Boolean, default: false },
})

const emit = defineEmits(['add', 'remove'])

const titleId = useId()
</script>

<template>
  <div class="epp-pick-table">
    <div v-if="title" :id="titleId" class="edit-table-title">{{ title }}</div>
    <div class="edit-table-card">
      <table class="edit-table" :aria-labelledby="title ? titleId : undefined">
        <colgroup>
          <col />
          <col class="edit-table__actions-col" />
        </colgroup>
        <thead>
          <tr>
            <th>{{ column }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-if="!items.length">
            <td colspan="2" class="edit-table__empty">{{ emptyText }}</td>
          </tr>
          <tr v-for="item in items" :key="item.key">
            <td :class="mono ? 'edit-table__mono' : 'edit-table__text'" :title="item.label">
              <slot name="item" :item="item">{{ item.label }}</slot>
            </td>
            <td class="edit-table__actions">
              <Button
                :aria-label="`Remove ${itemName} ${item.label}`"
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                @click="emit('remove', item.key)"
              />
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">
              <Button
                :label="addLabel"
                :icon="addIcon"
                text
                size="small"
                severity="secondary"
                @click="emit('add')"
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped src="./eppEditTable.css"></style>

<style scoped>
.epp-pick-table {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
</style>
