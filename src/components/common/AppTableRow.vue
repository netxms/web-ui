<script setup>
import Checkbox from 'primevue/checkbox'
import { useNavTarget } from '@/composables/useNavTarget'

/**
 * One data row of AppTable plus its expansion row; private to AppTable. A component of its own
 * so Vue re-renders a row only when its props change - which holds only while every prop keeps
 * its identity, so pass functions rather than per-row values such as `targetFor(row)` or inline
 * arrows. AppTable styles these elements through :deep().
 *
 * @slot cell {col: TableColumn, row: Object}
 * @slot expansion {row: Object}
 */
defineOptions({ name: 'AppTableRow' })

const props = defineProps({
  row: { type: Object, required: true },
  /** Position on the current page. */
  index: { type: Number, required: true },
  columns: { type: Array, required: true },
  rowClass: { type: Function, default: null },
  targetFor: { type: Function, default: null },
  /** Earns the row a tabindex. */
  clickable: { type: Boolean, default: false },
  /** Holds the table's single roving tab stop. */
  tabStop: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  canSelect: { type: Boolean, default: true },
  selected: { type: Boolean, default: false },
  expandable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  revealed: { type: Boolean, default: false },
  /** The empty trailing cell of AppTable's `autoWidth` filler column. */
  filler: { type: Boolean, default: false },
  totalColumns: { type: Number, required: true },
})

// Each mirrors the AppTable handler it is bound to, so listener props stay identical.
const emit = defineEmits([
  'activate',
  'toggle-select',
  'select-keydown',
  'row-keydown',
  'row-focus',
  'row-contextmenu',
  'row-mouseenter',
  'row-mouseleave',
])

const { navBindings } = useNavTarget()

function rowBindings() {
  return navBindings(props.targetFor?.(props.row) ?? null, (event) =>
    emit('activate', props.row, props.index, event),
  )
}
</script>

<template>
  <tr
    :class="[
      rowClass?.(row),
      {
        'app-table__row--selected': selectable && selected,
        'app-table__row--revealed': revealed,
      },
    ]"
    v-bind="rowBindings()"
    :tabindex="clickable ? (tabStop ? 0 : -1) : undefined"
    :aria-expanded="expandable ? expanded : undefined"
    :aria-selected="selectable ? selected : undefined"
    @contextmenu.prevent="emit('row-contextmenu', { event: $event, row })"
    @mouseenter="emit('row-mouseenter', row)"
    @mouseleave="emit('row-mouseleave', row)"
    @keydown="emit('row-keydown', $event, index)"
    @focus="emit('row-focus', index, row)"
    @blur="emit('row-mouseleave', row)"
  >
    <td v-if="selectable" class="app-table__checkbox-td">
      <!-- Roving tabindex: only the focused row's checkbox is a tab stop. Always
           focusable (0 or -1), but the rule only recognises a literal tabindex. -->
      <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus -->
      <div
        v-if="canSelect"
        class="app-table__checkbox-wrap"
        role="checkbox"
        :tabindex="tabStop ? 0 : -1"
        :aria-checked="selected"
        :aria-label="`Select row ${index + 1}`"
        @click.stop="emit('toggle-select', $event, row, index)"
        @keydown="emit('select-keydown', $event, row, index)"
      >
        <Checkbox
          :model-value="selected"
          :binary="true"
          :tabindex="-1"
          aria-hidden="true"
          style="pointer-events: none"
        />
      </div>
    </td>
    <td v-if="expandable" class="app-table__expander-td">
      <i
        :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
        class="app-table__expander-icon"
        aria-hidden="true"
      />
    </td>
    <td v-for="col in columns" :key="col.id">
      <!-- AppTable always forwards this slot; an empty one falls back to the field. -->
      <slot name="cell" :col="col" :row="row">{{ row[col.field] ?? '--' }}</slot>
    </td>
    <td v-if="filler" />
  </tr>
  <tr v-if="expandable && expanded" class="app-table__expansion-row">
    <td :colspan="totalColumns">
      <slot name="expansion" :row="row" />
    </td>
  </tr>
</template>
