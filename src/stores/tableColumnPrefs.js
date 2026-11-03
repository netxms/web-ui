import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { userPrefs } from '@/utils/appStorage'
import { moveColumnId, orderColumns } from '@/utils/columnOrder'

/**
 * Factory for a table's "which columns are visible, in what order" store. Column layout follows
 * the account (`userPrefs`); page sizes depend on the screen and stay in the `tables` bucket.
 *
 * @param {string} id - part of the `userPrefs` field names
 * @param {string[]} defaultColumns
 * @returns {import('pinia').StoreDefinition}
 *
 * @example
 * export const useAlarmTableStore = defineTableColumnStore('alarm', ['severity', 'state'])
 */
export function defineTableColumnStore(id, defaultColumns) {
  const field = `tables.${id}.columns`
  const orderField = `tables.${id}.order`

  function load() {
    const stored = userPrefs.get(field)
    return Array.isArray(stored) ? stored : [...defaultColumns]
  }

  function loadOrder() {
    const stored = userPrefs.get(orderField)
    return Array.isArray(stored) ? stored : []
  }

  return defineStore(`${id}TableColumns`, () => {
    const visibleColumnIds = ref(load())
    /** Column ids in the user's order; empty for the catalog's own order. */
    const columnOrder = ref(loadOrder())

    watch(visibleColumnIds, (value) => userPrefs.set(field, [...value]), { deep: true })
    watch(columnOrder, (value) => userPrefs.set(orderField, [...value]), { deep: true })
    watch(userPrefs.revision, () => {
      visibleColumnIds.value = load()
      columnOrder.value = loadOrder()
    })

    function resetColumns() {
      visibleColumnIds.value = [...defaultColumns]
    }

    /**
     * @template {{ id: string, mandatory?: boolean }} T
     * @param {T[]} catalog - the table's columns, in default order
     * @returns {T[]} the mandatory and ticked columns, in the user's order
     */
    function shownColumns(catalog) {
      return orderColumns(catalog, columnOrder.value).filter(
        (col) => col.mandatory || visibleColumnIds.value.includes(col.id),
      )
    }

    /**
     * @param {{ id: string }[]} catalog - the table's columns, in default order
     * @param {{ id: string, targetId: string, after: boolean }} move
     */
    function moveColumn(catalog, { id: colId, targetId, after }) {
      const ids = orderColumns(catalog, columnOrder.value).map((col) => col.id)
      const next = moveColumnId(ids, colId, targetId, after)
      if (next !== ids) columnOrder.value = next
    }

    return { visibleColumnIds, columnOrder, resetColumns, shownColumns, moveColumn }
  })
}
