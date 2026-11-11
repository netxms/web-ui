import { computed, ref, shallowRef, toValue, watch } from 'vue'
import {
  bounds,
  footprint,
  itemFootprint,
  itemsCentre,
  normalizeRotation,
  placementWarnings,
  polygonArea,
  polygonsOverlap,
  rectangleOf,
  resizeRectangle,
  rotateItems,
  rowPlacements,
  selfIntersects,
  snap,
  snapOffset,
} from '@/utils/floorPlan'
import {
  ELEMENT_TYPES,
  editModelFromPlan,
  elementTypeLabel,
  foldSaved,
  nextElementName,
  placementOf,
  saveOperations,
} from '@/utils/floorPlanEdits'

const UNDO_LIMIT = 50
/** Arrow step without a tile grid, and with Alt. */
const FREE_STEP = 100
const FINE_STEP = 10

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })

/**
 * Edit session over a floor plan: a working copy of the outline, the room's grid, passive
 * elements and rack placements, selection, undo history and the save. Item keys are `r:<rack id>`,
 * `e:<element id>` (negative for elements not saved yet) and `v:<outline index>`. The working
 * copy is replaced, never mutated, so a history entry is the model itself.
 *
 * @param {import('vue').MaybeRefOrGetter<object|null>} planSource - GET .../floor-plan document
 */
export function useFloorPlanEditor(planSource) {
  const plan = computed(() => toValue(planSource))

  const editMode = ref(false)
  const baseline = shallowRef(null)
  const working = shallowRef(null)
  const selection = ref([])
  const snapEnabled = ref(true)
  const saving = ref(false)
  /** `{ label, reason }` per call of the last save that failed */
  const failures = ref([])

  const undoStack = shallowRef([])
  const redoStack = shallowRef([])
  let stepTag = null
  let tempId = 0

  const planRackIds = computed(() => new Set((plan.value?.racks ?? []).map((r) => r.id)))
  /** The room's racks and those moving in. */
  const racksById = computed(() => {
    const racks = new Map((plan.value?.racks ?? []).map((r) => [r.id, r]))
    for (const rack of Object.values(working.value?.arrivals ?? {})) {
      if (!racks.has(rack.id)) racks.set(rack.id, rack)
    }
    return racks
  })

  /** A rack moving in that the room does not have yet: no save has bound it. */
  function isArriving(id, model = working.value) {
    return !!model?.arrivals?.[id] && !planRackIds.value.has(id) && !baseline.value?.placements[id]
  }
  const grid = computed(() => {
    const p = plan.value
    const tile = working.value?.room.gridTileSize ?? p?.gridTileSize
    return tile > 0 ? { tile, originX: p.gridOriginX ?? 0, originY: p.gridOriginY ?? 0 } : null
  })
  const snapGrid = computed(() => (snapEnabled.value ? grid.value : null))

  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
    stepTag = null
  }

  function enter() {
    if (!plan.value) return
    const model = editModelFromPlan(plan.value)
    baseline.value = model
    working.value = model
    selection.value = []
    failures.value = []
    clearHistory()
    editMode.value = true
  }

  function exit() {
    editMode.value = false
    baseline.value = null
    working.value = null
    selection.value = []
    failures.value = []
    clearHistory()
  }

  function discard() {
    working.value = baseline.value
    selection.value = []
    failures.value = []
    clearHistory()
  }

  /** Make `next` the working copy as one undo step; steps with the same tag merge. */
  function commit(next, tag = null) {
    if (!next || next === working.value) return
    if (!tag || tag !== stepTag) {
      undoStack.value = [...undoStack.value, working.value].slice(-UNDO_LIMIT)
      redoStack.value = []
    }
    stepTag = tag
    working.value = next
  }

  function undo() {
    if (!undoStack.value.length || saving.value) return
    redoStack.value = [...redoStack.value, working.value]
    working.value = undoStack.value.at(-1)
    undoStack.value = undoStack.value.slice(0, -1)
    stepTag = null
    pruneSelection()
  }

  function redo() {
    if (!redoStack.value.length || saving.value) return
    undoStack.value = [...undoStack.value, working.value]
    working.value = redoStack.value.at(-1)
    redoStack.value = redoStack.value.slice(0, -1)
    stepTag = null
    pruneSelection()
  }

  const canUndo = computed(() => editMode.value && undoStack.value.length > 0)
  const canRedo = computed(() => editMode.value && redoStack.value.length > 0)

  /** A rack's placement in a model: the working one, or the server's for a rack new to the room. */
  function placementIn(model, rack) {
    return model.placements[rack.id] ?? placementOf(rack)
  }

  /** Plan document with the working copy's geometry, for the canvas. */
  const editedPlan = computed(() => {
    const p = plan.value
    const w = working.value
    if (!p || !w) return p
    return {
      ...p,
      ...w.room,
      outline: w.outline,
      passiveElements: w.elements,
      area: polygonArea(w.outline.map(({ x, y }) => [x, y])),
      racks: [...racksById.value.values()].map((rack) => {
        const { rooms: _rooms, ...fields } = rack
        return { ...fields, ...placementIn(w, rack), arriving: isArriving(rack.id, w) }
      }),
    }
  })

  /** The item a key names in `model`, with what geometry needs; null when it is gone. */
  function itemOf(key, model = working.value) {
    if (!model) return null
    const [kind, raw] = key.split(':')
    const id = Number(raw)
    if (kind === 'r') {
      const rack = racksById.value.get(id)
      if (!rack) return null
      const p = placementIn(model, rack)
      return {
        key,
        kind: 'rack',
        id,
        name: rack.name,
        width: rack.width,
        depth: rack.depth,
        arrivingFrom: isArriving(id, model) ? model.arrivals[id].rooms : null,
        ...p,
      }
    }
    if (kind === 'e') {
      const element = model.elements.find((e) => e.id === id)
      return element ? { key, kind: 'element', ...element } : null
    }
    if (kind === 'v') {
      const point = model.outline[id]
      return point ? { key, kind: 'vertex', index: id, x: point.x, y: point.y } : null
    }
    return null
  }

  /** Placed racks and every element: what can be moved and checked. */
  function movableItems(model = working.value) {
    if (!model) return []
    const racks = [...racksById.value.keys()]
      .map((id) => itemOf(`r:${id}`, model))
      .filter((item) => item?.placed)
    const elements = model.elements.map((e) => itemOf(`e:${e.id}`, model))
    return [...racks, ...elements]
  }

  /** `model` with fields set on the keyed items. */
  function withItems(model, updates) {
    let { outline, elements, placements } = model
    for (const { key, ...fields } of updates) {
      const [kind, raw] = key.split(':')
      const id = Number(raw)
      if (kind === 'r') {
        const rack = racksById.value.get(id)
        if (!rack) continue
        placements = { ...placements, [id]: { ...placementIn(model, rack), ...fields } }
      } else if (kind === 'e') {
        elements = elements.map((e) => (e.id === id ? { ...e, ...fields } : e))
      } else if (kind === 'v') {
        outline = outline.map((p, i) => (i === id ? { ...p, ...fields } : p))
      }
    }
    return { ...model, outline, elements, placements }
  }

  const selectedItems = computed(() =>
    selection.value.map((key) => itemOf(key)).filter((item) => item && item.placed !== false),
  )

  function pruneSelection() {
    selection.value = selectedItems.value.map((item) => item.key)
  }

  /** Select one item, or with `toggle` add or remove it; a vertex is always selected alone. */
  function select(key, { toggle = false } = {}) {
    if (key == null) {
      selection.value = []
    } else if (key.startsWith('v:') || !toggle) {
      selection.value = [key]
    } else {
      const others = selection.value.filter((k) => !k.startsWith('v:'))
      selection.value = others.includes(key) ? others.filter((k) => k !== key) : [...others, key]
    }
  }

  /** Add every item touching the box to the selection. */
  function selectInBox(box) {
    const rect = [
      [box.minX, box.minY],
      [box.maxX, box.minY],
      [box.maxX, box.maxY],
      [box.minX, box.maxY],
    ]
    const hits = movableItems()
      .filter((item) => polygonsOverlap(itemFootprint(item), rect))
      .map((item) => item.key)
    const others = selection.value.filter((k) => !k.startsWith('v:'))
    selection.value = [...new Set([...others, ...hits])]
  }

  function snappedVertex(x, y) {
    const g = snapGrid.value
    return g ? { x: snap(x, g.originX, g.tile), y: snap(y, g.originY, g.tile) } : { x, y }
  }

  let drag = null

  /**
   * Pointer down on an item: it joins the selection, and the selection follows `dragTo`. A
   * press that does not move is a click, settled by `endDrag`.
   */
  function beginDrag(key, point, { toggle = false } = {}) {
    if (!editMode.value || saving.value) return
    const wasSelected = selection.value.includes(key)
    if (!wasSelected) {
      if (key.startsWith('v:') || !toggle) selection.value = [key]
      else selection.value = [...selection.value.filter((k) => !k.startsWith('v:')), key]
    }
    const keys = key.startsWith('v:') ? [key] : selection.value.filter((k) => !k.startsWith('v:'))
    const items = keys.map((k) => itemOf(k)).filter(Boolean)
    drag = { key, start: point, items, model: working.value, moved: false, toggle, wasSelected }
  }

  function dragTo(point) {
    if (!drag) return
    const dx = Math.round(point.x - drag.start.x)
    const dy = Math.round(point.y - drag.start.y)
    if (!drag.moved && dx === 0 && dy === 0) return
    let updates
    if (drag.key.startsWith('v:')) {
      const [vertex] = drag.items
      updates = [{ key: vertex.key, ...snappedVertex(vertex.x + dx, vertex.y + dy) }]
    } else {
      const anchor = drag.items.find((item) => item.key === drag.key) ?? drag.items[0]
      const moved = { ...anchor, x: anchor.x + dx, y: anchor.y + dy }
      const offset = snapOffset(itemFootprint(moved), snapGrid.value)
      updates = drag.items.map((item) => ({
        key: item.key,
        x: item.x + dx + offset.dx,
        y: item.y + dy + offset.dy,
      }))
    }
    const next = withItems(drag.model, updates)
    if (!drag.moved) {
      undoStack.value = [...undoStack.value, drag.model].slice(-UNDO_LIMIT)
      redoStack.value = []
      stepTag = null
      drag.moved = true
    }
    working.value = next
  }

  function endDrag() {
    const d = drag
    drag = null
    if (!d || d.moved) return
    if (!d.toggle) selection.value = [d.key]
    else if (d.wasSelected) selection.value = selection.value.filter((k) => k !== d.key)
  }

  const dragging = () => !!drag?.moved

  function nudge(dirX, dirY, fine = false) {
    if (!editMode.value || saving.value) return
    const items = selectedItems.value
    if (!items.length) return
    const step = fine ? FINE_STEP : (grid.value?.tile ?? FREE_STEP)
    const updates = items.map((item) => ({
      key: item.key,
      x: item.x + dirX * step,
      y: item.y + dirY * step,
    }))
    commit(withItems(working.value, updates), `nudge:${selection.value.join(',')}`)
  }

  /** Placed items turned by `degrees`: one around its own centre, several around theirs. */
  function rotated(items, degrees) {
    const centre = itemsCentre(items)
    const turned = rotateItems(items, degrees, centre).map((p, i) => ({ ...items[i], ...p }))
    const offset = snapOffset(turned.flatMap(itemFootprint), snapGrid.value)
    return turned.map((item) => ({
      key: item.key,
      x: item.x + offset.dx,
      y: item.y + offset.dy,
      rotation: item.rotation,
    }))
  }

  const movableSelection = computed(() =>
    selectedItems.value.filter((item) => item.kind !== 'vertex'),
  )

  function rotateSelection(degrees) {
    if (!editMode.value || saving.value || !movableSelection.value.length) return
    commit(withItems(working.value, rotated(movableSelection.value, degrees)))
  }

  const canRemoveVertex = computed(() => (working.value?.outline.length ?? 0) > 3)

  const without = (record, id) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => Number(key) !== id))

  /**
   * Racks leave the plan (one moving in goes back where it came from), elements are deleted, a
   * corner goes while three remain.
   */
  function removeSelection() {
    if (!editMode.value || saving.value || !selectedItems.value.length) return
    let model = working.value
    for (const item of selectedItems.value) {
      if (item.kind === 'rack' && isArriving(item.id, model)) {
        model = {
          ...model,
          arrivals: without(model.arrivals, item.id),
          placements: without(model.placements, item.id),
        }
      } else if (item.kind === 'rack') {
        model = withItems(model, [{ key: item.key, placed: false }])
      } else if (item.kind === 'element') {
        model = { ...model, elements: model.elements.filter((e) => e.id !== item.id) }
      } else if (item.kind === 'vertex' && canRemoveVertex.value) {
        model = { ...model, outline: model.outline.filter((_, i) => i !== item.index) }
      }
    }
    commit(model)
    selection.value = []
  }

  /** Reference corner that centres a footprint on `point`, snapped. */
  function centredAt(width, depth, rotation, point) {
    const b = bounds(footprint(0, 0, width, depth, rotation))
    const x = Math.round(point.x - (b.minX + b.maxX) / 2)
    const y = Math.round(point.y - (b.minY + b.maxY) / 2)
    const offset = snapOffset(footprint(x, y, width, depth, rotation), snapGrid.value)
    return { x: x + offset.dx, y: y + offset.dy }
  }

  function addElement(type, point) {
    if (!editMode.value || saving.value) return
    const spec = ELEMENT_TYPES.find((t) => t.type === type)
    if (!spec) return
    const id = --tempId
    const element = {
      id,
      name: nextElementName(working.value.elements, type),
      type,
      rotation: 0,
      width: spec.width,
      depth: spec.depth,
      ...centredAt(spec.width, spec.depth, 0, point),
    }
    commit({ ...working.value, elements: [...working.value.elements, element] })
    selection.value = [`e:${id}`]
  }

  const rackOf = (rackOrId) =>
    typeof rackOrId === 'object' ? rackOrId : racksById.value.get(rackOrId)

  /** Where an unplaced rack, or one from elsewhere, would land centred on `point`. */
  function rackLanding(rackOrId, point) {
    const rack = rackOf(rackOrId)
    if (!rack || !working.value) return null
    const { rotation } = placementIn(working.value, rack)
    return { rotation, ...centredAt(rack.width, rack.depth, rotation, point) }
  }

  /** @param {number|object} rackOrId - a rack of the room, or an `Arrival` */
  function ghostFor(rackOrId, point) {
    const rack = rackOf(rackOrId)
    const landing = point && rackLanding(rack, point)
    if (!landing) return null
    return footprint(landing.x, landing.y, rack.width, rack.depth, landing.rotation)
  }

  function placeRack(rackId, point) {
    if (!editMode.value || saving.value) return
    const landing = rackLanding(rackId, point)
    if (!landing) return
    commit(withItems(working.value, [{ key: `r:${rackId}`, placed: true, ...landing }]))
    selection.value = [`r:${rackId}`]
  }

  /** Placements of racks side by side in name order, centred on `point`, snapped as one. */
  function rowUpdates(racks, side, gap, point) {
    const sorted = [...racks].sort(byName)
    const row = rowPlacements(sorted, side, Math.max(0, Math.round(gap || 0)), [point.x, point.y])
    const items = sorted.map((rack, i) => ({ ...rack, ...row[i] }))
    const offset = snapOffset(items.flatMap(itemFootprint), snapGrid.value)
    return items.map((item) => ({
      key: `r:${item.id}`,
      placed: true,
      x: item.x + offset.dx,
      y: item.y + offset.dy,
      rotation: item.rotation,
    }))
  }

  /** Racks side by side in name order, centred on `point`, snapped as one. */
  function placeRow(rackIds, side, gap, point) {
    if (!editMode.value || saving.value) return
    const racks = rackIds.map((id) => racksById.value.get(id)).filter(Boolean)
    if (!racks.length) return
    const updates = rowUpdates(racks, side, gap, point)
    commit(withItems(working.value, updates))
    selection.value = updates.map((u) => u.key)
  }

  /**
   * Racks from elsewhere onto the plan: one centred on `point`, several as a row facing south.
   * They join the room on save.
   *
   * @param {Array<import('@/utils/floorPlanEdits').Arrival>} racks
   */
  function bringRacks(racks, point) {
    if (!editMode.value || saving.value) return
    const incoming = racks.filter((rack) => !racksById.value.has(rack.id))
    if (!incoming.length) return
    const updates =
      incoming.length === 1
        ? [{ key: `r:${incoming[0].id}`, placed: true, ...rackLanding(incoming[0], point) }]
        : rowUpdates(incoming, 'S', 0, point)
    const arrivals = { ...working.value.arrivals }
    const placements = { ...working.value.placements }
    for (const rack of incoming) arrivals[rack.id] = rack
    for (const { key, ...placement } of updates) placements[Number(key.slice(2))] = placement
    commit({ ...working.value, arrivals, placements })
    selection.value = updates.map((u) => u.key)
  }

  /** The selected racks as a row where they stand. */
  function lineUpSelection(side, gap) {
    const racks = selectedItems.value.filter((item) => item.kind === 'rack')
    if (!racks.length) return
    const [x, y] = itemsCentre(racks)
    placeRow(
      racks.map((r) => r.id),
      side,
      gap,
      { x, y },
    )
  }

  function insertVertex(edgeIndex, point) {
    if (!editMode.value || saving.value) return
    const outline = working.value.outline
    const vertex = snappedVertex(Math.round(point.x), Math.round(point.y))
    commit({ ...working.value, outline: outline.toSpliced(edgeIndex + 1, 0, vertex) })
    selection.value = [`v:${edgeIndex + 1}`]
  }

  /** Width and depth when the outline is a plain rectangle, which the room fields can resize. */
  const roomRectangle = computed(() => (working.value ? rectangleOf(working.value.outline) : null))

  /** A room field (tile size, tile labels): one undo step. */
  function updateRoom(fields) {
    if (!editMode.value || saving.value) return
    const room = working.value.room
    if (Object.entries(fields).every(([k, v]) => room[k] === v)) return
    commit({ ...working.value, room: { ...room, ...fields } })
  }

  /** A rectangular room's new size, its top left corner kept: one undo step. */
  function resizeRoom(width, depth) {
    if (!editMode.value || saving.value) return
    const outline = resizeRectangle(working.value.outline, width, depth)
    const rect = roomRectangle.value
    if (!outline || (rect.width === width && rect.depth === depth)) return
    commit({ ...working.value, outline })
  }

  /** An inspector change: one undo step. */
  function updateItem(key, fields) {
    if (!editMode.value || saving.value) return
    const next = { ...fields }
    if ('rotation' in next) next.rotation = normalizeRotation(next.rotation)
    const item = itemOf(key)
    if (!item || Object.entries(next).every(([k, v]) => item[k] === v)) return
    commit(withItems(working.value, [{ key, ...next }]))
  }

  function itemName(key, model = working.value) {
    const item = itemOf(key, model) ?? itemOf(key, baseline.value)
    if (!item) return key
    if (item.kind === 'rack') return item.name
    if (item.kind === 'element') {
      return item.name || `Unnamed ${elementTypeLabel(item.type).toLowerCase()}`
    }
    return `Corner ${item.index + 1}`
  }

  const warnings = computed(() => {
    if (!editMode.value || !working.value) return []
    const outline = working.value.outline.map(({ x, y }) => [x, y])
    const items = movableItems().map((item) => ({ key: item.key, corners: itemFootprint(item) }))
    const list = placementWarnings(outline, items).map((w) => ({
      ...w,
      text:
        w.kind === 'outside'
          ? `${itemName(w.keys[0])} is outside the room outline`
          : `${itemName(w.keys[0])} overlaps ${itemName(w.keys[1])}`,
    }))
    if (selfIntersects(outline)) {
      list.unshift({ kind: 'outline', keys: [], text: 'The outline crosses itself' })
    }
    return list
  })

  const warnedKeys = computed(() => new Set(warnings.value.flatMap((w) => w.keys)))

  const pendingOps = computed(() =>
    editMode.value && baseline.value && working.value
      ? saveOperations(baseline.value, working.value)
      : [],
  )
  const dirty = computed(() => pendingOps.value.length > 0)

  function opLabel(op) {
    switch (op.kind) {
      case 'room': {
        const parts = [
          op.payload.outline && 'outline',
          ('gridTileSize' in op.payload || 'gridLabels' in op.payload) && 'floor grid',
        ]
        return `Room ${parts.filter(Boolean).join(' and ')}`
      }
      case 'rack':
        return `${itemName(`r:${op.id}`)} placement`
      case 'rack-arrive':
        return `${itemName(`r:${op.id}`)}: move into this room`
      case 'element-create':
        return `${op.payload.name || elementTypeLabel(op.payload.type)}: add`
      case 'element-delete':
        return `${itemName(`e:${op.id}`, baseline.value)}: delete`
      default:
        return `${itemName(`e:${op.id}`)}: change`
    }
  }

  function failureReason(error) {
    if (error?.status === 403) return 'no modify rights (403)'
    if (error?.status) return `${error.message} (${error.status})`
    return error?.message || 'failed'
  }

  function renameElement(model, { from, to }) {
    return {
      ...model,
      elements: model.elements.map((e) => (e.id === from ? { ...e, id: to } : e)),
    }
  }

  /**
   * Send the pending changes through `run(ops, plan)`, which answers one `{ op, ok, answer,
   * error }` per call. What succeeded becomes the baseline; the rest stays unsaved and is listed
   * in `failures`.
   *
   * @returns {Promise<{ total: number, failed: number }>}
   */
  async function save(run) {
    const ops = pendingOps.value
    if (!ops.length || saving.value) return { total: 0, failed: 0 }
    saving.value = true
    failures.value = []
    try {
      const results = await run(ops, editedPlan.value)
      let nextBaseline = baseline.value
      let nextWorking = working.value
      const failed = []
      for (const result of results) {
        if (!result.ok) {
          failed.push({ label: opLabel(result.op), reason: failureReason(result.error) })
          continue
        }
        const folded = foldSaved(nextBaseline, result.op, result.answer)
        nextBaseline = folded.baseline
        if (folded.rename?.to != null) {
          nextWorking = renameElement(nextWorking, folded.rename)
          selection.value = selection.value.map((k) =>
            k === `e:${folded.rename.from}` ? `e:${folded.rename.to}` : k,
          )
        }
      }
      baseline.value = nextBaseline
      working.value = nextWorking
      failures.value = failed
      clearHistory()
      return { total: results.length, failed: failed.length }
    } finally {
      saving.value = false
    }
  }

  // The plan refreshes while editing: a rack new to the room joins the baseline as the server
  // has it, a rack gone from it leaves with its edits. A rack moving in stops being an arrival
  // once the room has it, and keeps its working placement.
  watch(plan, (p) => {
    if (!editMode.value || !p || !baseline.value) return
    const ids = new Set((p.racks ?? []).map((r) => r.id))
    const keep = (record, kept) =>
      Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => kept.has(Number(id))))
    const placements = keep(baseline.value.placements, ids)
    for (const rack of p.racks ?? []) placements[rack.id] ??= placementOf(rack)
    baseline.value = { ...baseline.value, placements }
    const arrivals = Object.fromEntries(
      Object.entries(working.value.arrivals ?? {}).filter(([id]) => !ids.has(Number(id))),
    )
    const kept = new Set([...ids, ...Object.keys(arrivals).map(Number)])
    working.value = { ...working.value, arrivals, placements: keep(working.value.placements, kept) }
    pruneSelection()
  })

  return {
    editMode,
    working,
    editedPlan,
    selection,
    selectedItems,
    movableSelection,
    snapEnabled,
    grid,
    saving,
    failures,
    dirty,
    pendingOps,
    canUndo,
    canRedo,
    canRemoveVertex,
    warnings,
    warnedKeys,
    enter,
    exit,
    discard,
    undo,
    redo,
    select,
    selectInBox,
    beginDrag,
    dragTo,
    endDrag,
    dragging,
    nudge,
    rotateSelection,
    removeSelection,
    addElement,
    ghostFor,
    placeRack,
    placeRow,
    bringRacks,
    lineUpSelection,
    insertVertex,
    roomRectangle,
    updateRoom,
    resizeRoom,
    updateItem,
    itemName,
    save,
  }
}
