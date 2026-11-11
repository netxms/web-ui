<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import FormField from '@/components/common/FormField.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import { bounds, facing, footprint, tileAt } from '@/utils/floorPlan'
import { GRID_LABEL_OPTIONS, LIMITS } from '@/utils/dataCenterProperties'
import { RACK_DRAG_TYPE, elementTypeLabel } from '@/utils/floorPlanEdits'

const props = defineProps({
  /** `reactive(useFloorPlanEditor(...))` */
  editor: { type: Object, required: true },
  /** The plan being edited */
  plan: { type: Object, required: true },
})

const emit = defineEmits(['place-rack', 'place-row', 'rack-drag-start', 'rack-drag-end'])

const FACING_OPTIONS = [
  { label: 'South', value: 'S' },
  { label: 'West', value: 'W' },
  { label: 'North', value: 'N' },
  { label: 'East', value: 'E' },
]
const FACING_LABEL = { N: 'north', S: 'south', E: 'east', W: 'west' }

const items = computed(() => props.editor.selectedItems)
const single = computed(() => (items.value.length === 1 ? items.value[0] : null))
const selectedRacks = computed(() => items.value.filter((item) => item.kind === 'rack'))
const racksById = computed(() => new Map((props.plan.racks ?? []).map((r) => [r.id, r])))
const unplaced = computed(() => (props.plan.racks ?? []).filter((rack) => !rack.placed))

const title = computed(() => {
  if (!items.value.length) return 'Room'
  if (!single.value) return `${items.value.length} selected`
  return { rack: 'Rack', element: 'Element', vertex: 'Corner' }[single.value.kind]
})

const summary = computed(() => {
  const racks = selectedRacks.value.length
  const elements = items.value.length - racks
  return [
    racks ? `${racks} ${racks === 1 ? 'rack' : 'racks'}` : '',
    elements ? `${elements} ${elements === 1 ? 'element' : 'elements'}` : '',
  ]
    .filter(Boolean)
    .join(', ')
})

// Fields edit a draft and reach the plan on blur or Enter, one undo step each.
const draft = reactive({})
watch(
  single,
  (item) => {
    for (const key of Object.keys(draft)) delete draft[key]
    if (item) Object.assign(draft, item)
  },
  { immediate: true },
)

function commit(field) {
  const item = single.value
  // InputNumber writes its model after the blur event.
  nextTick(() => {
    const value = draft[field]
    if (!item || value == null || value === '') return
    props.editor.updateItem(item.key, { [field]: field === 'name' ? String(value).trim() : value })
  })
}

// Room fields while nothing is selected, committed the same way.
const roomDraft = reactive({ width: 0, depth: 0, gridTileSize: 0, gridLabels: 'NONE' })
watch(
  () => [props.editor.roomRectangle, props.editor.working?.room],
  ([rect, room]) => {
    roomDraft.width = rect?.width ?? 0
    roomDraft.depth = rect?.depth ?? 0
    roomDraft.gridTileSize = room?.gridTileSize ?? 0
    roomDraft.gridLabels = room?.gridLabels ?? 'NONE'
  },
  { immediate: true },
)

const outlineSize = computed(() => {
  const b = bounds(props.plan.outline.map(({ x, y }) => [x, y]))
  return `${b.maxX - b.minX} \u00d7 ${b.maxY - b.minY} mm`
})

function commitSize() {
  nextTick(() => {
    if (roomDraft.width > 0 && roomDraft.depth > 0) {
      props.editor.resizeRoom(roomDraft.width, roomDraft.depth)
    }
  })
}

function commitRoom(field) {
  nextTick(() => {
    const value = roomDraft[field]
    if (value == null || value === '') return
    props.editor.updateRoom({ [field]: value })
  })
}

function blurOnEnter(event) {
  if (event.target?.blur) event.target.blur()
}

function position(item) {
  const b = bounds(footprint(item.x, item.y, item.width, item.depth, item.rotation))
  const tile = tileAt(props.plan, b.minX + 1, b.minY + 1)
  const side = FACING_LABEL[facing(item.rotation)]
  return [tile, side ? `front ${side}` : `${item.rotation}\u00b0`].filter(Boolean).join(', ')
}

const removeLabel = computed(() => {
  const kinds = new Set(items.value.map((item) => item.kind))
  if (kinds.size === 1 && kinds.has('rack')) return 'Remove from plan'
  if (kinds.size === 1 && kinds.has('vertex')) return 'Delete corner'
  return items.value.length === 1 ? 'Delete' : 'Remove'
})

const lineUp = reactive({ side: 'S', gap: 0 })
watch(
  () => selectedRacks.value[0]?.rotation,
  (rotation) => {
    lineUp.side = facing(rotation ?? 0) ?? 'S'
  },
  { immediate: true },
)

const rowOpen = ref(false)
const row = reactive({ ids: [], side: 'S', gap: 0 })
watch(
  () => unplaced.value.map((r) => r.id),
  (ids) => {
    row.ids = row.ids.filter((id) => ids.includes(id))
    if (!rowOpen.value) row.ids = ids
  },
  { immediate: true },
)

function openRow() {
  row.ids = unplaced.value.map((r) => r.id)
  rowOpen.value = true
}

function placeRow() {
  emit('place-row', { ids: [...row.ids], side: row.side, gap: row.gap ?? 0 })
  rowOpen.value = false
}

function onChipDragStart(rack, event) {
  event.dataTransfer.setData(RACK_DRAG_TYPE, String(rack.id))
  event.dataTransfer.effectAllowed = 'move'
  emit('rack-drag-start', rack.id)
}

function selectWarning(warning) {
  if (!warning.keys.length) return
  props.editor.select(warning.keys[0])
  for (const key of warning.keys.slice(1)) props.editor.select(key, { toggle: true })
}
</script>

<template>
  <div class="fp-edit-panel">
    <section v-if="editor.failures.length" class="fp-section" aria-live="polite">
      <Message severity="error" :closable="false">
        {{ editor.failures.length }}
        {{ editor.failures.length === 1 ? 'change was' : 'changes were' }} not saved. Save again to
        retry.
      </Message>
      <ul class="fp-failures">
        <li v-for="(failure, i) in editor.failures" :key="i">
          <strong>{{ failure.label }}</strong>
          <span>{{ failure.reason }}</span>
        </li>
      </ul>
    </section>

    <section class="fp-section">
      <h3 class="fp-section__title">{{ title }}</h3>

      <template v-if="!items.length">
        <!-- Enter in a field commits it, as leaving the field does. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div class="fp-fields" @keydown.enter="blurOnEnter">
          <template v-if="editor.roomRectangle">
            <FormField v-slot="{ id }" label="Width (mm)">
              <InputNumber
                v-model="roomDraft.width"
                :input-id="id"
                :use-grouping="false"
                :min="LIMITS.roomSize.min"
                :max="LIMITS.roomSize.max"
                :allow-empty="false"
                size="small"
                fluid
                @blur="commitSize"
              />
            </FormField>
            <FormField v-slot="{ id }" label="Depth (mm)">
              <InputNumber
                v-model="roomDraft.depth"
                :input-id="id"
                :use-grouping="false"
                :min="LIMITS.roomSize.min"
                :max="LIMITS.roomSize.max"
                :allow-empty="false"
                size="small"
                fluid
                @blur="commitSize"
              />
            </FormField>
          </template>
          <FormField v-slot="{ id, describedBy }" label="Floor tile (mm)" hint="0 = no grid">
            <InputNumber
              v-model="roomDraft.gridTileSize"
              :input-id="id"
              :use-grouping="false"
              :min="LIMITS.tileSize.min"
              :max="LIMITS.tileSize.max"
              :allow-empty="false"
              :aria-describedby="describedBy"
              size="small"
              fluid
              @blur="commitRoom('gridTileSize')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Tile labels" full-width>
            <Select
              v-model="roomDraft.gridLabels"
              :input-id="id"
              :options="GRID_LABEL_OPTIONS"
              option-label="label"
              option-value="value"
              size="small"
              fluid
              @change="commitRoom('gridLabels')"
            />
          </FormField>
        </div>
        <dl v-if="!editor.roomRectangle" class="fp-kv">
          <dt>Size</dt>
          <dd>{{ outlineSize }}</dd>
        </dl>
        <p class="fp-hint">
          Drag a corner to change the shape; double-click a wall to add one. Click a rack, element
          or corner to edit it. Shift+click or Shift+drag on the floor selects several.
        </p>
      </template>

      <template v-else-if="single?.kind === 'rack'">
        <div class="fp-selected-head">
          <strong>{{ single.name }}</strong>
          <StatusTag :status="racksById.get(single.id)?.status ?? 0" />
        </div>
        <!-- Enter in a field commits it, as leaving the field does. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div class="fp-fields" @keydown.enter="blurOnEnter">
          <FormField v-slot="{ id }" label="X (mm)">
            <InputNumber
              v-model="draft.x"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('x')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Y (mm)">
            <InputNumber
              v-model="draft.y"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('y')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Rotation (&deg;)">
            <InputNumber
              v-model="draft.rotation"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('rotation')"
            />
          </FormField>
        </div>
        <dl class="fp-kv">
          <dt>Position</dt>
          <dd>{{ position(single) }}</dd>
          <dt>Size</dt>
          <dd>
            {{ racksById.get(single.id)?.height }}U &middot; {{ single.width }} &times;
            {{ single.depth }} mm
          </dd>
        </dl>
      </template>

      <template v-else-if="single?.kind === 'element'">
        <!-- Enter in a field commits it, as leaving the field does. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div class="fp-fields" @keydown.enter="blurOnEnter">
          <FormField v-slot="{ id }" label="Name" full-width>
            <InputText
              :id="id"
              v-model="draft.name"
              size="small"
              maxlength="255"
              fluid
              @blur="commit('name')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="X (mm)">
            <InputNumber
              v-model="draft.x"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('x')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Y (mm)">
            <InputNumber
              v-model="draft.y"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('y')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Width (mm)">
            <InputNumber
              v-model="draft.width"
              :input-id="id"
              :use-grouping="false"
              :min="0"
              size="small"
              fluid
              @blur="commit('width')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Depth (mm)">
            <InputNumber
              v-model="draft.depth"
              :input-id="id"
              :use-grouping="false"
              :min="0"
              size="small"
              fluid
              @blur="commit('depth')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Rotation (&deg;)">
            <InputNumber
              v-model="draft.rotation"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('rotation')"
            />
          </FormField>
        </div>
        <dl class="fp-kv">
          <dt>Type</dt>
          <dd>{{ elementTypeLabel(single.type) }}</dd>
        </dl>
        <p class="fp-hint">The type is fixed once the element exists.</p>
      </template>

      <template v-else-if="single?.kind === 'vertex'">
        <p class="fp-hint">Corner {{ single.index + 1 }} of {{ plan.outline.length }}</p>
        <!-- Enter in a field commits it, as leaving the field does. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div class="fp-fields" @keydown.enter="blurOnEnter">
          <FormField v-slot="{ id }" label="X (mm)">
            <InputNumber
              v-model="draft.x"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('x')"
            />
          </FormField>
          <FormField v-slot="{ id }" label="Y (mm)">
            <InputNumber
              v-model="draft.y"
              :input-id="id"
              :use-grouping="false"
              size="small"
              fluid
              @blur="commit('y')"
            />
          </FormField>
        </div>
        <p v-if="!editor.canRemoveVertex" class="fp-hint">
          An outline keeps at least three corners.
        </p>
      </template>

      <p v-else class="fp-hint">{{ summary }}</p>

      <div v-if="items.length" class="fp-actions">
        <template v-if="editor.movableSelection.length">
          <Button
            label="Rotate left"
            icon="pi pi-replay"
            size="small"
            severity="secondary"
            outlined
            @click="editor.rotateSelection(-90)"
          />
          <Button
            label="Rotate right"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            outlined
            @click="editor.rotateSelection(90)"
          />
        </template>
        <Button
          :label="removeLabel"
          icon="pi pi-trash"
          size="small"
          severity="secondary"
          outlined
          :disabled="single?.kind === 'vertex' && !editor.canRemoveVertex"
          @click="editor.removeSelection()"
        />
      </div>

      <div v-if="selectedRacks.length > 1" class="fp-row-form">
        <h4 class="fp-row-form__title">Line up as a row</h4>
        <div class="fp-fields">
          <FormField v-slot="{ id }" label="Front faces">
            <Select
              v-model="lineUp.side"
              :input-id="id"
              :options="FACING_OPTIONS"
              option-label="label"
              option-value="value"
              size="small"
              fluid
            />
          </FormField>
          <FormField v-slot="{ id }" label="Gap (mm)">
            <InputNumber
              v-model="lineUp.gap"
              :input-id="id"
              :use-grouping="false"
              :min="0"
              size="small"
              fluid
            />
          </FormField>
        </div>
        <Button
          label="Line up"
          icon="pi pi-align-justify"
          size="small"
          severity="secondary"
          outlined
          @click="editor.lineUpSelection(lineUp.side, lineUp.gap ?? 0)"
        />
      </div>
    </section>

    <section v-if="editor.warnings.length" class="fp-section">
      <h3 class="fp-section__title">Warnings ({{ editor.warnings.length }})</h3>
      <ul class="fp-list">
        <li v-for="(warning, i) in editor.warnings" :key="i">
          <button
            type="button"
            class="fp-list__row fp-warning"
            :disabled="!warning.keys.length"
            @click="selectWarning(warning)"
          >
            <i class="pi pi-exclamation-triangle fp-warning__icon" aria-hidden="true" />
            <span>{{ warning.text }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="unplaced.length" class="fp-section">
      <h3 class="fp-section__title">Not placed ({{ unplaced.length }})</h3>
      <ul class="fp-chips">
        <li v-for="rack in unplaced" :key="rack.id">
          <button
            type="button"
            class="fp-chip fp-chip--drag"
            draggable="true"
            :aria-label="`Place ${rack.name} in the middle of the view`"
            @click="emit('place-rack', rack.id)"
            @dragstart="onChipDragStart(rack, $event)"
            @dragend="emit('rack-drag-end')"
          >
            <i class="pi pi-arrows-alt" aria-hidden="true" />
            {{ rack.name }}
          </button>
        </li>
      </ul>
      <p class="fp-hint">Drag a rack onto the plan, or click it to place it in the middle.</p>

      <Button
        v-if="!rowOpen && unplaced.length > 1"
        label="Place as row&hellip;"
        icon="pi pi-th-large"
        size="small"
        severity="secondary"
        outlined
        @click="openRow"
      />
      <div v-if="rowOpen" class="fp-row-form">
        <h4 class="fp-row-form__title">Place as row</h4>
        <div class="fp-row-form__racks" role="group" aria-label="Racks in the row">
          <label v-for="rack in unplaced" :key="rack.id" class="fp-row-form__rack">
            <Checkbox v-model="row.ids" :value="rack.id" />
            {{ rack.name }}
          </label>
        </div>
        <div class="fp-fields">
          <FormField v-slot="{ id }" label="Front faces">
            <Select
              v-model="row.side"
              :input-id="id"
              :options="FACING_OPTIONS"
              option-label="label"
              option-value="value"
              size="small"
              fluid
            />
          </FormField>
          <FormField v-slot="{ id }" label="Gap (mm)">
            <InputNumber
              v-model="row.gap"
              :input-id="id"
              :use-grouping="false"
              :min="0"
              size="small"
              fluid
            />
          </FormField>
        </div>
        <div class="fp-actions">
          <Button
            :label="`Place ${row.ids.length}`"
            icon="pi pi-check"
            size="small"
            :disabled="!row.ids.length"
            @click="placeRow"
          />
          <Button label="Cancel" size="small" severity="secondary" text @click="rowOpen = false" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fp-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.fp-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: 0.5rem 0.75rem;
}

.fp-fields :deep(.form-field--full) {
  grid-column: 1 / -1;
}

.fp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.fp-failures {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.fp-failures li {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.5rem;
}

.fp-failures span {
  color: var(--p-text-muted-color);
}

.fp-warning {
  align-items: flex-start;
}

.fp-warning:disabled {
  cursor: default;
}

.fp-warning__icon {
  margin-top: 0.15rem;
  font-size: 0.8125rem;
  color: var(--p-amber-500);
}

html.app-dark .fp-warning__icon {
  color: var(--p-amber-400);
}

.fp-chip--drag {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: grab;
}

.fp-chip--drag .pi {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.fp-row-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
}

.fp-row-form__title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.fp-row-form__racks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 0.875rem;
  font-size: 0.8125rem;
}

.fp-row-form__rack {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
}
</style>
