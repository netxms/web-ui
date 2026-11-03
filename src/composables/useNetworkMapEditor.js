import { shallowRef, ref, computed } from 'vue'
import {
  nextElementId,
  createObjectElement,
  createGroupBoxElement,
  createTextBoxElement,
  createDciContainerElement,
  createDciImageElement,
  createMapLink,
  mergeObjectEdit,
  mergeDecorationEdit,
  mergeTextBoxEdit,
  mergeDciContainerEdit,
  mergeDciImageEdit,
  mergeLinkEdit,
  hexToBgrInt,
  safeBgrIntToHex,
  parseMapFlags,
  serializeNetworkMapContent,
} from '@/utils/networkMapAdapters'

/**
 * Working-copy editor for a network map edit session. Save serializes the working copy
 * verbatim: positions and edits are already merged into each element's `raw`.
 *
 * `working` is a shallowRef: geometry edits mutate elements in place (no canvas rebuild
 * mid-drag); structural and property edits reassign `working.value` so the canvas rebuilds.
 */
export function useNetworkMapEditor() {
  const working = shallowRef(null)
  const editMode = ref(false)
  const revision = ref(0)
  const savedRevision = ref(0)
  let original = null

  // Undo history holds full snapshots. `bump()` runs after the edit is applied, so
  // `lastCommitted` keeps the pre-mutation state for it to push.
  const UNDO_LIMIT = 50
  const undoStack = []
  const redoStack = []
  let lastCommitted = null
  const undoDepth = ref(0)
  const redoDepth = ref(0)

  const dirty = computed(() => editMode.value && revision.value !== savedRevision.value)
  const canUndo = computed(() => editMode.value && undoDepth.value > 0)
  const canRedo = computed(() => editMode.value && redoDepth.value > 0)

  function syncHistoryDepth() {
    undoDepth.value = undoStack.length
    redoDepth.value = redoStack.length
  }

  function clearHistory() {
    undoStack.length = 0
    redoStack.length = 0
    lastCommitted = working.value ? clone(working.value) : null
    syncHistoryDepth()
  }

  function bump() {
    if (lastCommitted !== null) {
      undoStack.push(lastCommitted)
      if (undoStack.length > UNDO_LIMIT) undoStack.shift()
    }
    redoStack.length = 0
    lastCommitted = clone(working.value)
    revision.value++
    syncHistoryDepth()
  }

  function undo() {
    if (!undoStack.length) return
    redoStack.push(clone(working.value))
    const prev = undoStack.pop()
    working.value = prev
    lastCommitted = clone(prev)
    revision.value++
    syncHistoryDepth()
  }

  function redo() {
    if (!redoStack.length) return
    undoStack.push(clone(working.value))
    const next = redoStack.pop()
    working.value = next
    lastCommitted = clone(next)
    revision.value++
    syncHistoryDepth()
  }

  // Not structuredClone: it throws on the reactive proxy mapData carries.
  function clone(map) {
    return JSON.parse(JSON.stringify(map))
  }

  function enter(map) {
    if (!map) return
    original = clone(map)
    working.value = clone(map)
    revision.value = 0
    savedRevision.value = 0
    editMode.value = true
    clearHistory()
  }

  function exit() {
    editMode.value = false
    working.value = null
    original = null
    revision.value = 0
    savedRevision.value = 0
    clearHistory()
  }

  function discard() {
    if (!original) return
    working.value = clone(original)
    savedRevision.value = revision.value
    clearHistory()
  }

  function setNodePosition(id, x, y) {
    if (!working.value) return
    const el = working.value.elements.find((e) => e.id === id)
    if (!el) return
    el.x = Math.round(x)
    el.y = Math.round(y)
    el.raw = { ...el.raw, posX: el.x, posY: el.y }
    bump()
  }

  /**
   * In-place by default, since a layout run has already moved the canvas nodes. Callers that
   * move nodes the canvas does not know about (align to grid) pass `rebuild`.
   *
   * @param {Record<string, {x: number, y: number}>} positions
   * @param {boolean} [rebuild]
   */
  function applyLayoutPositions(positions, rebuild = false) {
    if (!working.value || !positions) return
    for (const el of working.value.elements) {
      const pos = positions[el.id]
      if (!pos) continue
      el.x = Math.round(pos.x)
      el.y = Math.round(pos.y)
      el.raw = { ...el.raw, posX: el.x, posY: el.y }
    }
    if (rebuild) working.value = { ...working.value, elements: [...working.value.elements] }
    bump()
  }

  /** Multi-adds are spread over a small grid around the anchor. Returns the new ids. */
  function addObjectElements(objects, anchor = {}) {
    if (!working.value || !objects?.length) return []
    let id = nextElementId(working.value)
    const ax = anchor.x ?? 0
    const ay = anchor.y ?? 0
    const created = objects.map((o, i) =>
      createObjectElement({
        id: id++,
        objectId: o.id ?? o.objectId,
        objectName: o.name ?? o.objectName ?? '',
        objectClass: o.class ?? o.objectClass ?? 'Node',
        objectStatus: o.status ?? o.objectStatus ?? 5,
        objectCategory: o.category ?? o.objectCategory ?? 0,
        x: ax + (i % 4) * 90,
        y: ay + Math.floor(i / 4) * 90,
      }),
    )
    working.value = { ...working.value, elements: [...working.value.elements, ...created] }
    bump()
    return created.map((e) => e.id)
  }

  function addGroupBox(pos = {}) {
    if (!working.value) return null
    const el = createGroupBoxElement({ id: nextElementId(working.value), x: pos.x, y: pos.y })
    working.value = { ...working.value, elements: [...working.value.elements, el] }
    bump()
    return el.id
  }

  function addTextBox(pos = {}) {
    if (!working.value) return null
    const el = createTextBoxElement({ id: nextElementId(working.value), x: pos.x, y: pos.y })
    working.value = { ...working.value, elements: [...working.value.elements, el] }
    bump()
    return el.id
  }

  function addDciContainer(pos = {}) {
    if (!working.value) return null
    const el = createDciContainerElement({ id: nextElementId(working.value), x: pos.x, y: pos.y })
    working.value = { ...working.value, elements: [...working.value.elements, el] }
    bump()
    return el.id
  }

  function addDciImage(pos = {}) {
    if (!working.value) return null
    const el = createDciImageElement({ id: nextElementId(working.value), x: pos.x, y: pos.y })
    working.value = { ...working.value, elements: [...working.value.elements, el] }
    bump()
    return el.id
  }

  function updateElement(id, patch) {
    if (!working.value || !patch) return
    const elements = working.value.elements.map((el) => {
      if (el.id !== id) return el
      if (el.type === 'object') return mergeObjectEdit(el, patch)
      if (el.type === 'text-box') return mergeTextBoxEdit(el, patch)
      if (el.type === 'decoration') return mergeDecorationEdit(el, patch)
      if (el.type === 'dci-container') return mergeDciContainerEdit(el, patch)
      if (el.type === 'dci-image') return mergeDciImageEdit(el, patch)
      return el
    })
    working.value = { ...working.value, elements }
    bump()
  }

  /**
   * Patches `rawContent`, which serializeNetworkMapContent spreads into the PUT payload.
   * `backgroundColor` is taken as hex and stored as a BGR int; the derived `background` and
   * `flags` are refreshed so the canvas re-renders live.
   */
  function updateMapSettings(patch) {
    if (!working.value || !patch) return
    const rawContent = { ...working.value.rawContent }
    for (const [k, v] of Object.entries(patch)) {
      rawContent[k] = k === 'backgroundColor' && typeof v === 'string' ? hexToBgrInt(v) : v
    }
    const bgHex = safeBgrIntToHex(rawContent.backgroundColor)
    const background = bgHex ? { type: 'color', color: bgHex } : null
    // rawContent.flags is the boolean-object wire form; mapData.flags is the bitmask.
    const flags = parseMapFlags(rawContent.flags)
    working.value = { ...working.value, rawContent, background, flags }
    bump()
  }

  function removeElements(ids) {
    if (!working.value || !ids?.length) return
    const idSet = new Set(ids)
    const elements = working.value.elements.filter((e) => !idSet.has(e.id))
    const links = working.value.links.filter((l) => !idSet.has(l.from) && !idSet.has(l.to))
    working.value = { ...working.value, elements, links }
    bump()
  }

  function removeLinks(ids) {
    if (!working.value || !ids?.length) return
    const idSet = new Set(ids)
    const links = working.value.links.filter((l) => !idSet.has(l.id))
    working.value = { ...working.value, links }
    bump()
  }

  /**
   * Link ids are session-local: the WebAPI has no link ids.
   * @returns {string | null}
   */
  function addLink(fromId, toId) {
    if (!working.value || !fromId || !toId || fromId === toId) return null
    const fromElement = working.value.elements.find((e) => e.id === fromId)
    const toElement = working.value.elements.find((e) => e.id === toId)
    if (fromElement?.type !== 'object' || toElement?.type !== 'object') return null
    let maxIdx = -1
    for (const l of working.value.links) {
      const match = /^l-(\d+)$/.exec(String(l.id))
      if (match) maxIdx = Math.max(maxIdx, Number(match[1]))
    }
    const link = createMapLink({ id: `l-${maxIdx + 1}`, fromElement, toElement })
    working.value = { ...working.value, links: [...working.value.links, link] }
    bump()
    return link.id
  }

  function updateLink(id, patch) {
    if (!working.value || !patch) return
    const links = working.value.links.map((l) => (l.id === id ? mergeLinkEdit(l, patch) : l))
    working.value = { ...working.value, links }
    bump()
  }

  function getElement(id) {
    return working.value?.elements.find((e) => e.id === id) ?? null
  }

  function getLink(id) {
    return working.value?.links.find((l) => l.id === id) ?? null
  }

  /**
   * Concurrent-edit check for the overwrite warning. The server reassigns link ids on every
   * PUT, so a real merge is impossible.
   * @returns {boolean}
   */
  function baselineDivergedFrom(freshMap) {
    if (!original || !freshMap) return false
    const a = JSON.stringify(serializeNetworkMapContent(original))
    const b = JSON.stringify(serializeNetworkMapContent(freshMap))
    return a !== b
  }

  return {
    working,
    editMode,
    dirty,
    canUndo,
    canRedo,
    enter,
    exit,
    discard,
    undo,
    redo,
    baselineDivergedFrom,
    setNodePosition,
    applyLayoutPositions,
    addObjectElements,
    addGroupBox,
    addTextBox,
    addDciContainer,
    addDciImage,
    updateElement,
    updateMapSettings,
    removeElements,
    removeLinks,
    addLink,
    updateLink,
    getElement,
    getLink,
  }
}
