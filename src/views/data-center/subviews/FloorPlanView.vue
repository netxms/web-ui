<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import FloorPlanCanvas from '@/components/data-center/FloorPlanCanvas.vue'
import FloorPlanEditPanel from '@/components/data-center/FloorPlanEditPanel.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import EditModeControls from '@/components/common/EditModeControls.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import {
  useDataCenterAlarms,
  useDataCenterValues,
  useFloorPlan,
  useRackLayouts,
  useSaveFloorPlan,
  useTaggedDcis,
} from '@/queries/useDataCenterQueries'
import { objectKeys, useObject, useObjects, useObjectTree } from '@/queries/useObjectQueries'
import { queryClient } from '@/queries/config'
import { isDemoDataCenterId } from '@/api/dataCenterApi'
import { getObject } from '@/api/objectsApi'
import { getImageDataUrl } from '@/api/imageLibraryApi'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useFloorPlanEditor } from '@/composables/useFloorPlanEditor'
import { useNavTarget } from '@/composables/useNavTarget'
import { useTheme } from '@/composables/useTheme'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { userPrefs } from '@/utils/appStorage'
import {
  feedSplit,
  freeUnits,
  indexNodes,
  rackAlarmCounts,
  racksAround,
  readMetric,
  roomsOfRacks,
  toKilowatts,
} from '@/utils/dataCenter'
import { facing, tileAt, footprint, bounds } from '@/utils/floorPlan'
import {
  OVERLAY_IDS,
  SCALE_OVERLAYS,
  feedBalanceLabels,
  scaleColor,
} from '@/utils/floorPlanOverlays'
import { ELEMENT_TYPES } from '@/utils/floorPlanEdits'
import { floorPlanMenuItems, removeLabelFor } from '@/utils/floorPlanMenu'
import { resolveHref } from '@/utils/navigation'
import { notifyNotImplemented } from '@/utils/notImplemented'
import { getStatusHexColor, getStatusInfo } from '@/utils/objectUtils'
import { FLOOR_PLAN_EDIT_QUERY, objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
})

const roomId = computed(() => props.object.id)
const isDemo = computed(() => isDemoDataCenterId(roomId.value))
const { isDark } = useTheme()
const { linkBindings } = useNavTarget()

const { data: plan, isLoading, error, refetch, isRefetching } = useFloorPlan(roomId)

const editor = reactive(useFloorPlanEditor(plan))
/** The plan as drawn: the working copy while editing. */
const shownPlan = computed(() => (editor.editMode ? editor.editedPlan : plan.value))

const placed = computed(() => (shownPlan.value?.racks ?? []).filter((rack) => rack.placed))
const unplaced = computed(() => (shownPlan.value?.racks ?? []).filter((rack) => !rack.placed))
const hasRacks = computed(() => (shownPlan.value?.racks ?? []).length > 0)

// The tree node carries no rights; the object does. A demo room exists only in the seed and
// keeps its edits in this tab, so anyone may edit it.
const {
  data: roomObject,
  isSuccess: roomLoaded,
  isError: roomFailed,
} = useObject(computed(() => (isDemo.value ? null : roomId.value)))
const canEdit = computed(
  () =>
    isDemo.value ||
    ((roomLoaded.value || roomFailed.value) && hasObjectRight(roomObject.value, 'MODIFY')),
)

// Overlay choice follows the account.
const OVERLAY_FIELD = 'dataCenter.floorPlanOverlay'
const DEFAULT_OVERLAY = 'status'
const loadOverlay = () => {
  const stored = userPrefs.get(OVERLAY_FIELD)
  return OVERLAY_IDS.includes(stored) ? stored : DEFAULT_OVERLAY
}
const overlay = ref(loadOverlay())
watch(userPrefs.revision, () => {
  overlay.value = loadOverlay()
})
watch(overlay, (value) => {
  if (value === DEFAULT_OVERLAY) userPrefs.remove(OVERLAY_FIELD)
  else userPrefs.set(OVERLAY_FIELD, value)
})
const overlayOptions = [
  { label: 'Status', value: 'status' },
  ...SCALE_OVERLAYS.map((o) => ({ label: o.label, value: o.id })),
]
const scaleOverlay = computed(() => SCALE_OVERLAYS.find((o) => o.id === overlay.value) ?? null)

const METRIC_TAGS = { inlet: 'env.temp.inlet', outlet: 'env.temp.outlet', power: 'power.feed' }
const rackIds = computed(() => (plan.value?.racks ?? []).map((rack) => rack.id))
const {
  items: taggedItems,
  isLoading: loadingDcis,
  isError: dciError,
} = useTaggedDcis(rackIds, Object.values(METRIC_TAGS))
const { valueOf, isFetching: fetchingValues } = useDataCenterValues(taggedItems)
const { layouts, isLoading: loadingLayouts } = useRackLayouts(rackIds)
const { data: alarms } = useDataCenterAlarms(roomId)

/** Rack id to the objects in it: what the sub-tree has below it and what its layout mounts. */
const rackMembers = computed(() => {
  const subTree = new Map(
    (props.object.children ?? [])
      .filter((child) => child.class === 'Rack')
      .map((rack) => [rack.id, rack]),
  )
  const members = new Map()
  for (const id of rackIds.value) {
    const ids = new Set(indexNodes(subTree.get(id)?.children).keys())
    for (const element of layouts.value.get(id)?.elements ?? []) {
      if (element.objectId != null) ids.add(element.objectId)
    }
    members.set(id, ids)
  }
  return members
})
const alarmCounts = computed(() =>
  alarms.value ? rackAlarmCounts(alarms.value, rackMembers.value) : new Map(),
)

function metricsOf(id, own) {
  const of = (metric) => own.filter((item) => item.base === METRIC_TAGS[metric])
  const read = (metric, combine) =>
    of(metric).length ? readMetric(of(metric), valueOf, combine) : null
  const raw = read('power')
  const power = raw
    ? {
        ...raw,
        value: toKilowatts(raw.value, raw.unit),
        parts: raw.parts.map((p) => ({ ...p, value: toKilowatts(p.value, raw.unit) })),
      }
    : null
  const free = freeUnits(layouts.value.get(id))
  const alarmCount = alarmCounts.value.get(id)
  return {
    inlet: read('inlet', 'max'),
    outlet: read('outlet', 'max'),
    power,
    split: feedSplit(power),
    free: free == null ? null : { value: free },
    alarms: alarmCount == null ? null : { value: alarmCount },
  }
}

const rackMetrics = computed(() => {
  const result = new Map()
  for (const id of rackIds.value) {
    result.set(
      id,
      metricsOf(
        id,
        taggedItems.value.filter((item) => item.objectId === id),
      ),
    )
  }
  return result
})

/** The two feeds most racks of the room run on; a rack on another pair has no balance value. */
const roomFeeds = computed(() => {
  const counts = new Map()
  for (const m of rackMetrics.value.values()) {
    if (!m.split) continue
    const key = JSON.stringify(m.split.feeds)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return best ? JSON.parse(best[0]) : ['A', 'B']
})

const metrics = computed(() => {
  const result = new Map()
  const pair = JSON.stringify(roomFeeds.value)
  for (const [id, m] of rackMetrics.value) {
    const balanced = m.split && JSON.stringify(m.split.feeds) === pair
    result.set(id, { ...m, feedShare: balanced ? { value: m.split.share * 100 } : null })
  }
  return result
})

const legendLabels = computed(() =>
  scaleOverlay.value?.id === 'feeds'
    ? feedBalanceLabels(roomFeeds.value[0], roomFeeds.value[1])
    : (scaleOverlay.value?.labels ?? []),
)

function fillFor(rack) {
  if (!scaleOverlay.value) return getStatusHexColor(rack.status)
  return scaleColor(
    scaleOverlay.value,
    metrics.value.get(rack.id)?.[scaleOverlay.value.metric]?.value,
    isDark.value,
  )
}

function ringFor(rack) {
  return scaleOverlay.value && rack.status >= 1 && rack.status <= 4
    ? getStatusHexColor(rack.status)
    : null
}

/** Demo racks exist only in the seed, so there is no rack view to open. */
function rackTarget(rack) {
  return isDemo.value ? null : objectTarget({ id: rack.id, class: 'Rack' }, 'rack')
}

const selectedId = ref(null)
watch(roomId, () => {
  selectedId.value = null
})
const selected = computed(
  () => (plan.value?.racks ?? []).find((rack) => rack.id === selectedId.value) ?? null,
)

const canvasSelection = computed(() => {
  if (editor.editMode) return new Set(editor.selection)
  return new Set(selectedId.value == null ? [] : [`r:${selectedId.value}`])
})

// The edit controls card over the plan's top right corner, with its margin.
const EDIT_CONTROLS_INSET = 56

const canvasRef = ref(null)
const viewCentre = () => canvasRef.value?.viewCentre() ?? { x: 0, y: 0 }

function enterEdit() {
  const keep = selectedId.value
  editor.enter()
  if (keep != null && placed.value.some((rack) => rack.id === keep)) editor.select(`r:${keep}`)
}

/** Back to viewing; a single selected rack stays selected. */
function leaveEdit() {
  const [only] = editor.selection
  editor.exit()
  if (only?.startsWith('r:')) selectedId.value = Number(only.slice(2))
}

const confirm = useConfirm()
const toast = useToast()

/** Resolves true when nothing is lost: no unsaved change, or the user lets it go. */
function confirmDiscard() {
  if (!editor.dirty) return Promise.resolve(true)
  return new Promise((resolve) => {
    confirm.require({
      header: 'Unsaved changes',
      message: 'This floor plan has unsaved changes. Discard them?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard changes',
      rejectLabel: 'Keep editing',
      accept: () => resolve(true),
      reject: () => resolve(false),
      // Escape / close icon fire neither accept nor reject.
      onHide: () => resolve(false),
    })
  })
}

// The flag a new room arrives with: edit mode once the plan and the rights are in, then the flag
// leaves the URL, so Back or a reload does not enter edit mode again.
const route = useRoute()
const router = useRouter()
watch(
  () => [route.query[FLOOR_PLAN_EDIT_QUERY], plan.value, canEdit.value, roomLoaded.value],
  ([flag, loaded]) => {
    if (!flag || !loaded || !(isDemo.value || roomLoaded.value || roomFailed.value)) return
    if (canEdit.value && !editor.editMode) enterEdit()
    const query = { ...route.query }
    delete query[FLOOR_PLAN_EDIT_QUERY]
    router.replace({ query, hash: route.hash })
  },
  { immediate: true },
)

async function exitEdit() {
  if (await confirmDiscard()) leaveEdit()
}

const { mutateAsync: runSave } = useSaveFloorPlan()

async function save() {
  if (!editor.dirty || editor.saving) return
  const result = await editor.save((ops, edited) =>
    runSave({ roomId: roomId.value, ops, plan: JSON.parse(JSON.stringify(edited)) }),
  )
  if (!result.total) return
  if (!result.failed) {
    leaveEdit()
    toast.add({ severity: 'success', summary: 'Floor plan saved', life: 2000 })
  } else {
    toast.add({
      severity: 'error',
      summary: 'Floor plan partly saved',
      detail: `${result.failed} of ${result.total} changes were not saved.`,
      life: 5000,
    })
  }
}

useUnsavedChangesGuard(
  computed(() => editor.dirty),
  { includeRouteUpdates: true },
)

function onBeforeUnload(event) {
  if (!editor.dirty) return
  event.preventDefault()
  // Required by some browsers for the native "leave site?" prompt to show.
  event.returnValue = ''
}

const rootRef = ref(null)
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const TYPING = 'input, textarea, select, [contenteditable="true"], .p-select, .p-inputnumber'

// Save and undo work wherever the focus is; the rest only with the focus on this view.
function onKeydown(event) {
  if (!editor.editMode) return
  const key = event.key.toLowerCase()
  const mod = event.ctrlKey || event.metaKey
  if (mod && key === 's') {
    event.preventDefault()
    save()
    return
  }
  if (event.target?.closest?.(TYPING)) return
  if (mod && (key === 'z' || key === 'y')) {
    event.preventDefault()
    if (key === 'y' || event.shiftKey) editor.redo()
    else editor.undo()
    return
  }
  const active = document.activeElement
  if (mod || !(active === document.body || rootRef.value?.contains(active))) return
  if (ARROWS[event.key]) {
    event.preventDefault()
    editor.nudge(...ARROWS[event.key], event.altKey)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    editor.removeSelection()
  } else if (key === 'r') {
    event.preventDefault()
    editor.rotateSelection(event.shiftKey ? -90 : 90)
  } else if (event.key === 'Escape') {
    editor.select(null)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

const removeLabel = computed(() => removeLabelFor(editor.selectedItems))

// Right-click menu over the plan. An item clicked outside the selection becomes the selection;
// the floor's Add and Place switch to edit mode on their own.
const canvasMenuRef = ref(null)
const menuTarget = ref(null)
const MENU_KINDS = { r: 'rack', e: 'element', v: 'vertex' }

function onCanvasContextMenu({ event, point, key, edge }) {
  if (editor.saving) return
  const kind = key ? MENU_KINDS[key[0]] : edge != null ? 'wall' : 'floor'
  if (key && editor.editMode && !editor.selection.includes(key)) editor.select(key)
  if (kind === 'rack' && !editor.editMode) selectedId.value = Number(key.slice(2))
  menuTarget.value = { kind, key, edge, point }
  canvasMenuRef.value?.show(event)
}

function ensureEditMode() {
  if (!editor.editMode) enterEdit()
}

const roomPropertiesTarget = computed(() =>
  isDemo.value ? null : objectTarget(props.object, 'properties', { query: { section: 'room' } }),
)

const menuCommands = {
  addElement(type, point) {
    ensureEditMode()
    editor.addElement(type, point)
  },
  placeRack(id, point) {
    ensureEditMode()
    editor.placeRack(id, point)
  },
  rotate: (degrees) => editor.rotateSelection(degrees),
  remove: () => editor.removeSelection(),
  lineUp() {
    const first = editor.selectedItems.find((item) => item.kind === 'rack')
    editor.lineUpSelection(facing(first?.rotation ?? 0) ?? 'S', 0)
  },
  insertVertex: (edge, point) => editor.insertVertex(edge, point),
  openRack: (id) => router.push(rackTarget({ id })),
  fit: () => canvasRef.value?.fit(),
  openRoomProperties: () => router.push(roomPropertiesTarget.value),
}

function menuItemName(key) {
  if (editor.editMode) return editor.itemName(key)
  return (plan.value?.racks ?? []).find((rack) => `r:${rack.id}` === key)?.name ?? ''
}

const canvasMenuItems = computed(() => {
  if (!menuTarget.value) return []
  return floorPlanMenuItems(menuTarget.value, {
    editMode: editor.editMode,
    canEdit: canEdit.value && !editor.saving,
    selectedItems: editor.selectedItems,
    unplaced: unplaced.value,
    canRemoveVertex: editor.canRemoveVertex,
    nameOf: menuItemName,
    rackHref: (id) => {
      const target = rackTarget({ id })
      return target ? resolveHref(target) : null
    },
    roomPropertiesHref: roomPropertiesTarget.value && resolveHref(roomPropertiesTarget.value),
    run: menuCommands,
  })
})

// Racks from elsewhere come from the Infrastructure tree, read only while editing a real room.
const { data: rootObjects } = useObjects()
const serviceRootId = computed(
  () => (rootObjects.value ?? []).find((o) => o.class === 'ServiceRoot')?.id ?? 2,
)
const takesRacksIn = computed(() => editor.editMode && !isDemo.value)
const { data: infrastructure } = useObjectTree(
  computed(() => (takesRacksIn.value ? serviceRootId.value : null)),
)
const incomingRacks = computed(() => {
  if (!takesRacksIn.value || !infrastructure.value) return []
  const here = new Set((shownPlan.value?.racks ?? []).map((rack) => rack.id))
  return racksAround(infrastructure.value, roomId.value).filter((rack) => !here.has(rack.id))
})

// A cabinet whose document lacks its footprint.
const FALLBACK_RACK = { width: 600, depth: 1000, height: 42 }

/** Read through the cache: a rack listed beside the plan was often opened before. */
function fetchRack(id) {
  return queryClient.fetchQuery({ queryKey: objectKeys.detail(id), queryFn: () => getObject(id) })
}

/** A listed rack with the footprint its document gives, ready for `editor.bringRacks`. */
async function arrivalOf(rack) {
  const doc = await fetchRack(rack.id).catch(() => null)
  return {
    id: rack.id,
    name: rack.name,
    status: rack.status ?? doc?.status ?? 0,
    width: doc?.width > 0 ? doc.width : FALLBACK_RACK.width,
    depth: doc?.depth > 0 ? doc.depth : FALLBACK_RACK.depth,
    height: doc?.height > 0 ? doc.height : FALLBACK_RACK.height,
    rooms: rack.rooms,
  }
}

async function bringRacks(racks, point) {
  const arrivals = await Promise.all(racks.map(arrivalOf))
  editor.bringRacks(arrivals, point)
}

const findRacksVisible = ref(false)
const findRackPerspectives = computed(() => [
  { id: 'infrastructure', label: 'Infrastructure', rootId: serviceRootId.value },
])
const isFindableRack = (node) =>
  node.class === 'Rack' && !(shownPlan.value?.racks ?? []).some((rack) => rack.id === node.id)

function onRacksFound(nodes) {
  const rooms = roomsOfRacks(infrastructure.value ?? [])
  bringRacks(
    nodes.map((node) => ({ ...node, rooms: rooms.get(node.id) ?? [] })),
    viewCentre(),
  )
}

// A rack dragged from the side list: its landing spot follows the pointer. One from elsewhere
// is drawn with its own footprint once its document is in.
const draggingRackId = ref(null)
const draggingIncoming = ref(null)
const ghost = ref(null)

function startIncomingDrag(rack) {
  const arrival = { ...FALLBACK_RACK, ...rack }
  draggingIncoming.value = arrival
  arrivalOf(rack).then((full) => {
    if (draggingIncoming.value === arrival) draggingIncoming.value = full
  })
}

function onRackOver(point) {
  if (!point) ghost.value = null
  else if (draggingRackId.value != null) ghost.value = editor.ghostFor(draggingRackId.value, point)
  else if (draggingIncoming.value) ghost.value = editor.ghostFor(draggingIncoming.value, point)
  else ghost.value = null
}

function endRackDrag() {
  draggingRackId.value = null
  draggingIncoming.value = null
  ghost.value = null
}

function onRackDrop(point) {
  if (point && draggingRackId.value != null) editor.placeRack(draggingRackId.value, point)
  else if (point && draggingIncoming.value) bringRacks([draggingIncoming.value], point)
  endRackDrag()
}

const attention = computed(() =>
  placed.value
    .filter((rack) => rack.status >= 1 && rack.status <= 4)
    .sort((a, b) => b.status - a.status || a.name.localeCompare(b.name)),
)

const summary = computed(() => {
  let power = 0
  let powerKnown = 0
  let hottest = null
  for (const rack of placed.value) {
    const m = metrics.value.get(rack.id)
    if (m?.power) {
      power += m.power.value
      powerKnown++
    }
    if (m?.inlet && (!hottest || m.inlet.value > hottest.value)) {
      hottest = { value: m.inlet.value, rack }
    }
  }
  return { power, powerKnown, hottest }
})

const FACING_LABEL = { N: 'north', S: 'south', E: 'east', W: 'west' }

function position(rack) {
  if (!plan.value || !rack.placed) return 'not placed'
  const b = bounds(footprint(rack.x, rack.y, rack.width, rack.depth, rack.rotation))
  const tile = tileAt(plan.value, b.minX + 1, b.minY + 1)
  const side = FACING_LABEL[facing(rack.rotation)]
  const parts = [tile, side ? `front ${side}` : `${rack.rotation}°`].filter(Boolean)
  return parts.join(', ')
}

const fmt = (value, digits = 1) => (value == null ? '—' : value.toFixed(digits))

function splitText(split) {
  if (!split) return '—'
  const first = Math.round(split.share * 100)
  return `${split.feeds[0]} ${first} % · ${split.feeds[1]} ${100 - first} %`
}

const unitsText = (m) => (m?.free ? `${m.free.value} U` : '—')
const alarmsText = (m) => (m?.alarms ? String(m.alarms.value) : '—')

// Backdrop calibration: micrometres per image pixel, offset in room millimetres.
const backdrop = ref(null)
watch(
  () => [plan.value?.backgroundImage, plan.value?.backgroundScale],
  async ([guid, scale]) => {
    backdrop.value = null
    if (!guid || !(scale > 0)) return
    const url = await getImageDataUrl(guid)
    if (!url) return
    const image = new Image()
    image.onload = () => {
      backdrop.value = {
        url,
        x: plan.value.backgroundX ?? 0,
        y: plan.value.backgroundY ?? 0,
        width: (image.naturalWidth * scale) / 1000,
        height: (image.naturalHeight * scale) / 1000,
      }
    }
    image.src = url
  },
  { immediate: true },
)
</script>

<template>
  <div ref="rootRef" class="floor-plan-view">
    <LoadingState v-if="isLoading" message="Loading floor plan…" />
    <QueryErrorState
      v-else-if="error"
      :error="error"
      :retrying="isRefetching"
      class="fp-error"
      @retry="refetch"
    />
    <template v-else-if="shownPlan">
      <div class="fp-toolbar">
        <span class="fp-toolbar__stat">
          <i class="pi pi-th-large" />
          {{ fmt(shownPlan.area, 1) }} m²
        </span>
        <span class="fp-toolbar__stat fp-toolbar__stat--muted">
          <template v-if="hasRacks">
            {{ placed.length }} of {{ shownPlan.racks.length }} racks placed
          </template>
          <template v-else>No racks</template>
        </span>
        <span v-if="summary.powerKnown" class="fp-toolbar__stat fp-toolbar__stat--muted">
          {{ fmt(summary.power) }} kW across {{ summary.powerKnown }} racks
        </span>
        <span v-if="summary.hottest" class="fp-toolbar__stat fp-toolbar__stat--muted">
          Hottest inlet {{ fmt(summary.hottest.value) }} °C ({{ summary.hottest.rack.name }})
        </span>
        <span v-if="dciError" class="fp-toolbar__stat fp-toolbar__stat--muted">
          <i class="pi pi-exclamation-triangle" aria-hidden="true" />
          Some rack metrics could not be read
        </span>
        <div class="fp-toolbar__spacer" />
        <i
          v-if="loadingDcis || loadingLayouts || fetchingValues"
          class="pi pi-spin pi-spinner fp-toolbar__spinner"
          aria-hidden="true"
        />
        <SelectButton
          v-if="hasRacks"
          v-model="overlay"
          :options="overlayOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          aria-label="Floor plan overlay"
        />
      </div>

      <Transition name="fp-edit-bar">
        <div
          v-if="editor.editMode"
          class="fp-edit-bar"
          role="toolbar"
          aria-label="Floor plan tools"
        >
          <span class="fp-edit-bar__label">
            <i class="pi pi-pencil" aria-hidden="true" />
            Add
          </span>
          <Button
            v-for="type in ELEMENT_TYPES"
            :key="type.type"
            :label="type.label"
            :aria-label="`Add ${type.label.toLowerCase()}`"
            icon="pi pi-plus"
            size="small"
            text
            severity="secondary"
            :disabled="editor.saving"
            @click="editor.addElement(type.type, viewCentre())"
          />
          <div class="fp-edit-bar__sep" />
          <Button
            v-tooltip.bottom="'Rotate left (Shift+R)'"
            icon="pi pi-replay"
            size="small"
            text
            severity="secondary"
            aria-label="Rotate left"
            :disabled="!editor.movableSelection.length || editor.saving"
            @click="editor.rotateSelection(-90)"
          />
          <Button
            v-tooltip.bottom="'Rotate right (R)'"
            icon="pi pi-refresh"
            size="small"
            text
            severity="secondary"
            aria-label="Rotate right"
            :disabled="!editor.movableSelection.length || editor.saving"
            @click="editor.rotateSelection(90)"
          />
          <Button
            v-tooltip.bottom="`${removeLabel} (Delete)`"
            icon="pi pi-trash"
            size="small"
            text
            severity="secondary"
            :aria-label="removeLabel"
            :disabled="!editor.selectedItems.length || editor.saving"
            @click="editor.removeSelection()"
          />
          <template v-if="editor.grid || shownPlan.backgroundImage">
            <div class="fp-edit-bar__sep" />
            <Button
              v-if="editor.grid"
              v-tooltip.bottom="'Snap to the tile grid while dragging'"
              label="Snap"
              icon="pi pi-th-large"
              size="small"
              text
              :severity="editor.snapEnabled ? undefined : 'secondary'"
              :aria-pressed="editor.snapEnabled"
              @click="editor.snapEnabled = !editor.snapEnabled"
            />
            <Button
              v-if="shownPlan.backgroundImage"
              label="Backdrop"
              icon="pi pi-image"
              size="small"
              text
              severity="secondary"
              @click="notifyNotImplemented('Moving and calibrating the backdrop')"
            />
          </template>
          <span v-if="editor.warnings.length" class="fp-edit-bar__warn">
            <i class="pi pi-exclamation-triangle" aria-hidden="true" />
            {{ editor.warnings.length }}
            {{ editor.warnings.length === 1 ? 'warning' : 'warnings' }}
          </span>
          <span class="fp-edit-bar__hint">
            Drag to move. Arrows nudge by
            {{ editor.grid ? 'a tile' : '100 mm' }}, Alt+arrows by 10 mm.
          </span>
        </div>
      </Transition>

      <div class="fp-body">
        <FloorPlanCanvas
          ref="canvasRef"
          :plan="shownPlan"
          :fill-for="fillFor"
          :ring-for="ringFor"
          :selected-keys="canvasSelection"
          :warned-keys="editor.warnedKeys"
          :edit-mode="editor.editMode"
          :ghost="ghost"
          :target-for="rackTarget"
          :backdrop="backdrop"
          :fit-inset-top="canEdit ? EDIT_CONTROLS_INSET : 0"
          @select="(rack) => (selectedId = rack.id)"
          @activate="(key) => editor.select(key)"
          @drag-start="({ key, point, toggle }) => editor.beginDrag(key, point, { toggle })"
          @drag-move="(point) => editor.dragTo(point)"
          @drag-end="editor.endDrag()"
          @marquee="(box) => editor.selectInBox(box)"
          @clear-selection="editor.select(null)"
          @insert-vertex="({ edge, point }) => editor.insertVertex(edge, point)"
          @rack-over="onRackOver"
          @rack-drop="onRackDrop"
          @context-menu="onCanvasContextMenu"
        >
          <template v-if="canEdit" #controls>
            <EditModeControls
              mode-label="Floor plan mode"
              :edit-mode="editor.editMode"
              :dirty="editor.dirty"
              :saving="editor.saving"
              :can-undo="editor.canUndo"
              :can-redo="editor.canRedo"
              @enter-edit="enterEdit"
              @exit-edit="exitEdit"
              @save="save"
              @discard="editor.discard()"
              @undo="editor.undo()"
              @redo="editor.redo()"
            />
          </template>
          <template #tooltip="{ rack }">
            <div class="fp-tip-head">
              <strong>{{ rack.name }}</strong>
              <StatusTag :status="rack.status" />
            </div>
            <dl class="fp-kv">
              <dt>Inlet</dt>
              <dd>{{ fmt(metrics.get(rack.id)?.inlet?.value) }} °C</dd>
              <dt>Outlet</dt>
              <dd>{{ fmt(metrics.get(rack.id)?.outlet?.value) }} °C</dd>
              <dt>Power</dt>
              <dd>{{ fmt(metrics.get(rack.id)?.power?.value) }} kW</dd>
              <dt>Feeds</dt>
              <dd>{{ splitText(metrics.get(rack.id)?.split) }}</dd>
              <dt>Free</dt>
              <dd>{{ unitsText(metrics.get(rack.id)) }}</dd>
              <dt>Alarms</dt>
              <dd>{{ alarmsText(metrics.get(rack.id)) }}</dd>
              <dt>Position</dt>
              <dd>{{ position(rack) }}</dd>
            </dl>
          </template>
        </FloorPlanCanvas>

        <aside class="fp-side" aria-label="Floor plan details">
          <DemoNoticeBanner
            v-if="isDemo"
            message="Demo room: values are fixed, and floor plan edits stay in this tab until it reloads. Nothing is saved to the server."
          />

          <FloorPlanEditPanel
            v-if="editor.editMode"
            :editor="editor"
            :plan="shownPlan"
            :incoming="incomingRacks"
            :can-find="takesRacksIn"
            @place-rack="(id) => editor.placeRack(id, viewCentre())"
            @place-row="({ ids, side, gap }) => editor.placeRow(ids, side, gap, viewCentre())"
            @rack-drag-start="(id) => (draggingRackId = id)"
            @rack-drag-end="endRackDrag"
            @bring-rack="(rack) => bringRacks([rack], viewCentre())"
            @incoming-drag-start="startIncomingDrag"
            @find-racks="findRacksVisible = true"
          />

          <template v-else>
            <p v-if="!hasRacks" class="fp-hint">No racks in this room yet.</p>

            <section v-if="hasRacks" class="fp-section">
              <div class="fp-section__head">
                <h3 class="fp-section__title">
                  {{ scaleOverlay ? scaleOverlay.title : 'Rack status' }}
                </h3>
                <InfoHint
                  v-if="scaleOverlay"
                  :text="
                    scaleOverlay.tag
                      ? `Metrics are DCIs tagged ${scaleOverlay.tag}.`
                      : scaleOverlay.note
                  "
                  :label="scaleOverlay.title"
                />
              </div>
              <ul v-if="scaleOverlay" class="fp-legend">
                <li v-for="(label, i) in legendLabels" :key="label">
                  <span
                    class="fp-swatch"
                    :style="{ background: (isDark ? scaleOverlay.dark : scaleOverlay.light)[i] }"
                  />
                  {{ label }}
                </li>
                <li>
                  <span class="fp-swatch fp-swatch--nodata" />
                  no value
                </li>
              </ul>
              <ul v-else class="fp-legend">
                <li v-for="status in [0, 1, 2, 3, 4]" :key="status">
                  <StatusIcon :status="status" />
                  {{ getStatusInfo(status).label }}
                </li>
              </ul>
              <p v-if="scaleOverlay" class="fp-hint">
                Racks outlined in a status color need attention.
              </p>
            </section>

            <section v-if="attention.length" class="fp-section">
              <h3 class="fp-section__title">Needs attention</h3>
              <ul class="fp-list">
                <li v-for="rack in attention" :key="rack.id">
                  <button type="button" class="fp-list__row" @click="selectedId = rack.id">
                    <StatusIcon :status="rack.status" />
                    <span class="fp-list__name">{{ rack.name }}</span>
                    <span class="fp-list__meta">
                      {{ getStatusInfo(rack.status).label }}
                      <template v-if="metrics.get(rack.id)?.inlet">
                        · {{ fmt(metrics.get(rack.id).inlet.value) }} °C
                      </template>
                    </span>
                  </button>
                </li>
              </ul>
            </section>

            <section v-if="hasRacks" class="fp-section">
              <h3 class="fp-section__title">Selected rack</h3>
              <template v-if="selected">
                <div class="fp-selected-head">
                  <strong>{{ selected.name }}</strong>
                  <StatusTag :status="selected.status" />
                </div>
                <dl class="fp-kv">
                  <dt>Inlet</dt>
                  <dd>{{ fmt(metrics.get(selected.id)?.inlet?.value) }} °C</dd>
                  <dt>Outlet</dt>
                  <dd>{{ fmt(metrics.get(selected.id)?.outlet?.value) }} °C</dd>
                  <template
                    v-for="part in metrics.get(selected.id)?.power?.parts ?? []"
                    :key="part.qualifier"
                  >
                    <dt>Feed {{ part.qualifier || '—' }}</dt>
                    <dd>{{ fmt(part.value) }} kW</dd>
                  </template>
                  <dt>Power</dt>
                  <dd>{{ fmt(metrics.get(selected.id)?.power?.value) }} kW</dd>
                  <dt>Balance</dt>
                  <dd>{{ splitText(metrics.get(selected.id)?.split) }}</dd>
                  <dt>Free</dt>
                  <dd>{{ unitsText(metrics.get(selected.id)) }}</dd>
                  <dt>Alarms</dt>
                  <dd>{{ alarmsText(metrics.get(selected.id)) }}</dd>
                  <dt>Size</dt>
                  <dd>{{ selected.height }}U · {{ selected.width }} × {{ selected.depth }} mm</dd>
                  <dt>Position</dt>
                  <dd>{{ position(selected) }}</dd>
                </dl>
                <Button
                  v-if="rackTarget(selected)"
                  as="a"
                  v-bind="linkBindings(rackTarget(selected))"
                  label="Open rack"
                  icon="pi pi-server"
                  size="small"
                  severity="secondary"
                  outlined
                />
              </template>
              <p v-else class="fp-hint">
                Click a rack to see its values here.
                <template v-if="!isDemo">
                  Ctrl+click or middle click opens it in a new tab.
                </template>
              </p>
            </section>

            <section v-if="unplaced.length" class="fp-section">
              <h3 class="fp-section__title">Not placed ({{ unplaced.length }})</h3>
              <ul class="fp-chips">
                <li v-for="rack in unplaced" :key="rack.id">
                  <button type="button" class="fp-chip" @click="selectedId = rack.id">
                    {{ rack.name }}
                  </button>
                </li>
              </ul>
              <p class="fp-hint">
                In this room but without a position on the plan.
                <template v-if="canEdit">Switch to Edit to place them.</template>
              </p>
            </section>
          </template>
        </aside>
      </div>
    </template>

    <ActionContextMenu ref="canvasMenuRef" :items="canvasMenuItems" />

    <!-- v-if unmounts when closed, dropping its tree subscription. -->
    <ObjectPickerDialog
      v-if="findRacksVisible"
      visible
      title="Find Rack"
      :perspectives="findRackPerspectives"
      :selectable="isFindableRack"
      :display-filter="isFindableRack"
      multi-select
      @update:visible="findRacksVisible = $event"
      @select="onRacksFound"
    />
  </div>
</template>

<style scoped>
.floor-plan-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
}

.fp-error {
  flex: 1;
  justify-content: center;
}

.fp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  flex-shrink: 0;
}

.fp-toolbar__stat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.fp-toolbar__stat--muted {
  color: var(--p-text-muted-color);
}

.fp-toolbar__spacer {
  flex: 1;
}

.fp-toolbar :deep(.p-selectbutton) {
  flex-wrap: wrap;
  max-width: 100%;
}

.fp-edit-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.fp-edit-bar__label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-inline-end: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.fp-edit-bar__sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.25rem;
  background: var(--p-content-border-color);
}

.fp-edit-bar__warn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-inline-start: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.fp-edit-bar__warn .pi {
  color: var(--p-amber-500);
}

html.app-dark .fp-edit-bar__warn .pi {
  color: var(--p-amber-400);
}

.fp-edit-bar__hint {
  margin-inline-start: auto;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.fp-edit-bar-enter-active,
.fp-edit-bar-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fp-edit-bar-enter-from,
.fp-edit-bar-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.fp-toolbar__spinner {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.fp-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.fp-side {
  width: 18rem;
  flex-shrink: 0;
  overflow-y: auto;
  border-inline-start: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.fp-section,
.fp-side :deep(.fp-section) {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fp-section__head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.fp-section__title,
.fp-side :deep(.fp-section__title) {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.fp-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
}

.fp-legend li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fp-swatch {
  width: 1.5rem;
  height: 0.75rem;
  border-radius: 2px;
  border: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.fp-swatch--nodata {
  background: repeating-linear-gradient(
    45deg,
    color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background)) 0 3px,
    color-mix(in srgb, var(--p-text-color) 22%, var(--p-content-background)) 3px 4px
  );
}

.fp-hint,
.fp-side :deep(.fp-hint) {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.45;
}

.fp-list,
.fp-chips,
.fp-side :deep(.fp-list),
.fp-side :deep(.fp-chips) {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fp-list,
.fp-side :deep(.fp-list) {
  display: grid;
  gap: 0.125rem;
}

.fp-list__row,
.fp-side :deep(.fp-list__row) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.3rem 0.4rem;
  border: 0;
  border-radius: var(--p-border-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  text-align: start;
  cursor: pointer;
}

.fp-list__row:hover,
.fp-chip:hover,
.fp-side :deep(.fp-list__row:hover),
.fp-side :deep(.fp-chip:hover) {
  background: var(--p-content-hover-background);
}

.fp-list__name,
.fp-side :deep(.fp-list__name) {
  font-weight: 600;
}

.fp-list__meta,
.fp-side :deep(.fp-list__meta) {
  margin-inline-start: auto;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

.fp-chips,
.fp-side :deep(.fp-chips) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.fp-chip,
.fp-side :deep(.fp-chip) {
  padding: 0.2rem 0.6rem;
  border: 1px dashed var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.fp-selected-head,
.fp-tip-head,
.fp-side :deep(.fp-selected-head) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.fp-tip-head {
  margin-bottom: 0.375rem;
}

.fp-kv,
.fp-side :deep(.fp-kv) {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  margin: 0;
  font-size: 0.8125rem;
}

.fp-kv dt,
.fp-side :deep(.fp-kv dt) {
  color: var(--p-text-muted-color);
}

.fp-kv dd,
.fp-side :deep(.fp-kv dd) {
  margin: 0;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

/* Stacked, the plan keeps a fixed height and the panel below scrolls with it. */
@container (max-width: 760px) {
  .fp-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .fp-body :deep(.fp-canvas) {
    flex: none;
    height: 24rem;
  }

  .fp-side {
    flex: none;
    width: auto;
    overflow: visible;
    border-inline-start: 0;
    border-top: 1px solid var(--p-content-border-color);
  }
}
</style>
