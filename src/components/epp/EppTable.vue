<script setup>
import { ref, computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import AppLink from '@/components/common/AppLink.vue'
import { useRowSelection } from '@/composables/useRowSelection'

defineOptions({ name: 'EppTable' })

const props = defineProps({
  rules: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  selectedIds: { type: Set, default: () => new Set() },
  expandedIds: { type: Set, default: () => new Set() },
  cutIds: { type: Set, default: () => new Set() },
  pendingIds: { type: Set, default: () => new Set() },
  canReorder: { type: Boolean, default: true },
  canManage: { type: Boolean, default: false },
  positionMap: { type: Object, default: () => ({}) },
  /** Chain id → display name, for the chips naming the chains a rule enters. */
  chainLabels: { type: Map, default: () => new Map() },
  /** `(chainId) => RouteLocationRaw`; makes those chips real links. */
  chainTargetFor: { type: Function, default: null },
})

const emit = defineEmits([
  'reorder',
  'toggle-enabled',
  'selection-change',
  'expansion-change',
  'row-contextmenu',
  'menu-click',
  'retry',
])

const RF_DISABLED = 0x10
const RF_STOP_PROCESSING = 0x01

function isEnabled(rule) {
  return (rule.flags & RF_DISABLED) === 0
}

/** A chain deleted between load and save keeps its id visible rather than vanishing. */
function chainLabelFor(chainId) {
  return props.chainLabels.get(chainId) ?? `Chain #${chainId}`
}

const totalCols = computed(() => (props.canReorder ? 7 : 6))

const dragSrcIndex = ref(null)
const dropIndex = ref(null)

function onDragStart(event, index) {
  dragSrcIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event, index) {
  if (dragSrcIndex.value === null) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}

function onDragLeave(event, index) {
  const related = event.relatedTarget
  if (related && event.currentTarget.contains(related)) return
  if (dropIndex.value === index) dropIndex.value = null
}

function onDrop(event, index) {
  event.preventDefault()
  if (dragSrcIndex.value === null || dragSrcIndex.value === index) {
    resetDrag()
    return
  }
  const newRules = [...props.rules]
  const [moved] = newRules.splice(dragSrcIndex.value, 1)
  const insertAt = dragSrcIndex.value < index ? index - 1 : index
  newRules.splice(insertAt, 0, moved)
  emit('reorder', newRules)
  resetDrag()
}

function onDragEnd() {
  resetDrag()
}

function resetDrag() {
  dragSrcIndex.value = null
  dropIndex.value = null
}

const {
  isSelected: isRuleSelected,
  toggle: onCheckboxClick,
  onKeydown: onCheckboxKeydown,
  onTableMouseDown,
} = useRowSelection({
  rows: () => props.rules,
  idOf: (rule) => rule.guid,
  selectedIds: () => props.selectedIds,
  onChange: (next) => emit('selection-change', next),
})

function onExpanderClick(event, rule) {
  event.stopPropagation()
  const newSet = new Set(props.expandedIds)
  if (newSet.has(rule.guid)) {
    newSet.delete(rule.guid)
  } else {
    newSet.add(rule.guid)
  }
  emit('expansion-change', newSet)
}

function onRowContextMenu(event, rule) {
  event.preventDefault()
  emit('row-contextmenu', { event, rule })
}
</script>

<template>
  <!-- mousedown only suppresses text selection during a shift/ctrl-click rule selection. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div class="epp-table-outer" @mousedown="onTableMouseDown">
    <div class="epp-table-wrap">
      <table class="epp-table">
        <colgroup>
          <col style="width: 2.5rem" />
          <col style="width: 2.25rem" />
          <col style="width: 3rem" />
          <col />
          <col style="width: 3.25rem" />
          <col style="width: 3.25rem" />
          <col v-if="canReorder" style="width: 2.5rem" />
        </colgroup>

        <thead>
          <tr>
            <th class="epp-table__th-icon" />
            <th class="epp-table__th-icon" />
            <th class="epp-table__th-pos">#</th>
            <th>Description</th>
            <th class="epp-table__th-icon" />
            <th class="epp-table__th-icon" />
            <th v-if="canReorder" class="epp-table__th-icon" />
          </tr>
        </thead>

        <tbody>
          <tr v-if="loading">
            <td :colspan="totalCols" class="epp-table__state-cell"><LoadingState /></td>
          </tr>

          <tr v-else-if="error">
            <td :colspan="totalCols" class="epp-table__state-cell">
              <QueryErrorState :error="error" @retry="emit('retry')" />
            </td>
          </tr>

          <tr v-else-if="!rules.length">
            <td :colspan="totalCols" class="epp-table__state-cell">
              <slot name="empty">No event processing rules defined.</slot>
            </td>
          </tr>

          <template v-else>
            <template v-for="(rule, index) in rules" :key="rule.guid">
              <tr
                :class="{
                  'epp-table__row--selected': isRuleSelected(rule),
                  'epp-table__row--expanded': expandedIds.has(rule.guid),
                  'epp-table__row--dragging': dragSrcIndex === index,
                  'epp-table__drop-above': dropIndex === index && dragSrcIndex !== index,
                }"
                @contextmenu="onRowContextMenu($event, rule)"
                @dragover="onDragOver($event, index)"
                @dragleave="onDragLeave($event, index)"
                @drop="onDrop($event, index)"
              >
                <td class="epp-table__td-checkbox">
                  <!-- The wrapper owns the shift-click range; the inert Checkbox is hidden
                       from assistive technology so the cell is not announced twice. -->
                  <div
                    class="epp-table__checkbox-wrap"
                    role="checkbox"
                    tabindex="0"
                    :aria-checked="isRuleSelected(rule)"
                    :aria-label="`Select rule ${index + 1}`"
                    @click.stop="onCheckboxClick($event, rule, index)"
                    @keydown="onCheckboxKeydown($event, rule, index)"
                  >
                    <Checkbox
                      :model-value="isRuleSelected(rule)"
                      :binary="true"
                      :tabindex="-1"
                      aria-hidden="true"
                      style="pointer-events: none"
                    />
                  </div>
                </td>

                <td class="epp-table__td-icon">
                  <button
                    class="epp-table__expander-btn"
                    @click.stop="onExpanderClick($event, rule)"
                  >
                    <i
                      :class="
                        expandedIds.has(rule.guid) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'
                      "
                    />
                  </button>
                </td>

                <td class="epp-table__td-pos">
                  <span class="rule-position">{{ positionMap[rule.guid] ?? '' }}</span>
                </td>

                <!-- Primary expand/collapse click target -->
                <td class="epp-table__td-desc" @click.stop="onExpanderClick($event, rule)">
                  <div class="rule-description-cell">
                    <span
                      class="rule-comments"
                      :class="{
                        'rule-disabled': !isEnabled(rule),
                        'rule-cut': cutIds.has(rule.guid),
                        'rule-pending': pendingIds.has(rule.guid),
                      }"
                    >
                      {{ rule.comments || '(unnamed rule)' }}
                    </span>
                    <Tag
                      v-if="rule.flags & RF_STOP_PROCESSING"
                      v-tooltip.top="'Stop processing after this rule'"
                      value="STOP"
                      severity="warn"
                      class="flag-tag"
                    />
                    <!-- `.stop` keeps the click off the row's expand handler; the anchor
                         keeps new-tab clicks. -->
                    <AppLink
                      v-for="chainId in rule.chainCalls ?? []"
                      :key="chainId"
                      v-tooltip.top="`Go to the ${chainLabelFor(chainId)} chain`"
                      :to="chainTargetFor?.(chainId) ?? ''"
                      class="chain-call-chip"
                      @click.stop
                    >
                      <i class="pi pi-arrow-right chain-call-chip__icon" />
                      {{ chainLabelFor(chainId) }}
                    </AppLink>
                  </div>
                </td>

                <td class="epp-table__td-icon">
                  <ToggleSwitch
                    :model-value="isEnabled(rule)"
                    :disabled="!canManage"
                    @update:model-value="emit('toggle-enabled', rule)"
                    @click.stop
                  />
                </td>

                <td class="epp-table__td-icon">
                  <div class="row-actions">
                    <Button
                      icon="pi pi-ellipsis-v"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      class="row-action-btn"
                      aria-label="Rule actions"
                      @click.stop="emit('menu-click', { event: $event, rule })"
                    />
                  </div>
                </td>

                <td
                  v-if="canReorder"
                  class="epp-table__td-drag"
                  draggable="true"
                  @dragstart="onDragStart($event, index)"
                  @dragend="onDragEnd"
                >
                  <i class="pi pi-bars epp-table__drag-icon" />
                </td>
              </tr>

              <tr
                v-if="expandedIds.has(rule.guid)"
                class="epp-table__expansion-row"
                @contextmenu="onRowContextMenu($event, rule)"
              >
                <td :colspan="totalCols">
                  <slot name="expansion" :rule="rule" />
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.epp-table-outer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.epp-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
}

.epp-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.8125rem;
}

.epp-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--p-datatable-header-cell-background, var(--p-surface-100));
  border-bottom: 2px solid var(--p-content-border-color);
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  user-select: none;
  padding: 0.25rem 0.5rem;
}

.epp-table__th-icon {
  text-align: center;
}

.epp-table__th-pos {
  text-align: center;
  color: var(--p-text-muted-color);
  font-weight: 500;
}

.epp-table tbody td {
  border-bottom: 1px solid var(--p-content-border-color);
  vertical-align: middle;
  white-space: nowrap;
  overflow: hidden;
  padding: 0.3rem 0.5rem;
}

.epp-table tbody tr:hover td {
  background: var(--p-content-hover-background);
}

.epp-table__row--selected td {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.epp-table__row--selected:hover td {
  background: color-mix(in srgb, var(--p-primary-color) 16%, transparent);
}

.epp-table__row--expanded td {
  background: var(--p-surface-ground);
  border-bottom-color: transparent;
}

.epp-table__row--expanded:hover td {
  background: var(--p-content-hover-background);
}

.epp-table__row--dragging {
  opacity: 0.4;
}

.epp-table__drop-above td {
  border-top: 2px solid var(--p-primary-color);
}

.epp-table__state-cell {
  padding: 1.5rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.epp-table__state-cell :deep(.query-error-state) {
  justify-content: center;
}

.epp-table__td-icon {
  text-align: center;
}

.epp-table__td-checkbox {
  position: relative;
  padding: 0;
  text-align: center;
}

.epp-table__td-pos {
  text-align: center;
}

.epp-table__td-drag {
  cursor: grab;
  text-align: center;
  color: var(--p-text-muted-color);
}

.epp-table__td-drag:active {
  cursor: grabbing;
}

.epp-table__drag-icon {
  font-size: 0.85rem;
  opacity: 0.5;
}

.epp-table__checkbox-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.epp-table__checkbox-wrap:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.epp-table__expander-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
}

.epp-table__expander-btn:hover {
  background: var(--p-content-hover-background);
}

.rule-position {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.epp-table__td-desc {
  cursor: pointer;
}

.rule-description-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.rule-comments {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-disabled {
  opacity: 0.45;
  text-decoration: line-through;
}

.rule-cut {
  opacity: 0.4;
  font-style: italic;
}

.rule-pending {
  color: var(--p-primary-color);
}

.flag-tag {
  font-size: 0.7rem;
  padding: 1px 5px;
  flex-shrink: 0;
}

/* Reads as an outbound edge rather than a status tag. */
.chain-call-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  line-height: 1.4;
  padding: 1px 6px 1px 4px;
  border: 1px solid var(--p-primary-color);
  border-radius: 0.75rem;
  color: var(--p-primary-color);
  flex-shrink: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chain-call-chip:hover {
  background: var(--p-highlight-background);
}

.chain-call-chip__icon {
  font-size: 0.6rem;
}

.row-actions {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.row-action-btn {
  width: 1.75rem;
  height: 1.75rem;
}

.epp-table__expansion-row td {
  padding: 0;
  background: var(--p-content-hover-background);
  border-bottom: 1px solid var(--p-content-border-color);
}
</style>
