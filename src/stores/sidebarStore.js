import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { createBucket, userPrefs } from '@/utils/appStorage'
import { DRAG_AND_DROP_PREFERENCES } from '@/utils/treeDragDrop'

/** The width stays in this browser; the aliases and drag and drop choices follow the account. */
const sidebarBucket = createBucket('sidebar', 'local')
const ALIASES_FIELD = 'sidebar.showAliases'
const DRAG_AND_DROP_FIELD = 'sidebar.dragAndDrop'

const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 280

function clampWidth(px) {
  const n = Number(px)
  if (Number.isNaN(n)) return DEFAULT_WIDTH
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)))
}

function loadFromStorage() {
  const stored = sidebarBucket.read()
  return Object.keys(stored).length ? stored : null
}

function saveToStorage(data) {
  sidebarBucket.write(data)
}

function readShowAliases() {
  const stored = userPrefs.get(ALIASES_FIELD)
  return typeof stored === 'boolean' ? stored : true
}

function readDragAndDrop() {
  const stored = userPrefs.get(DRAG_AND_DROP_FIELD)
  return DRAG_AND_DROP_PREFERENCES.includes(stored) ? stored : 'server'
}

export const useSidebarStore = defineStore('sidebar', () => {
  // e.g. "dns.example (mail server)"
  const showAliases = ref(readShowAliases())
  /** One of DRAG_AND_DROP_PREFERENCES. */
  const dragAndDrop = ref(readDragAndDrop())
  // px
  const sidebarWidth = ref(DEFAULT_WIDTH)

  const stored = loadFromStorage()
  if (stored?.sidebarWidth != null) sidebarWidth.value = clampWidth(stored.sidebarWidth)

  // Sync flush so a toggle or resize is stored immediately.
  watch(showAliases, (value) => userPrefs.set(ALIASES_FIELD, value), { flush: 'sync' })
  watch(dragAndDrop, (value) => userPrefs.set(DRAG_AND_DROP_FIELD, value), { flush: 'sync' })
  watch(sidebarWidth, (value) => saveToStorage({ sidebarWidth: value }), { flush: 'sync' })

  watch(userPrefs.revision, () => {
    showAliases.value = readShowAliases()
    dragAndDrop.value = readDragAndDrop()
  })

  function toggleAliases() {
    showAliases.value = !showAliases.value
  }

  function setDragAndDrop(value) {
    if (DRAG_AND_DROP_PREFERENCES.includes(value)) dragAndDrop.value = value
  }

  function setSidebarWidth(px) {
    sidebarWidth.value = clampWidth(px)
  }

  return {
    showAliases,
    dragAndDrop,
    sidebarWidth,
    toggleAliases,
    setDragAndDrop,
    setSidebarWidth,
  }
})
