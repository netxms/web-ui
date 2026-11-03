<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Skeleton from 'primevue/skeleton'
import MibTreeNode from './MibTreeNode.vue'
import { useMibChildren } from '@/queries/useMibQueries'

defineProps({
  selectedOid: { type: String, default: null },
})

const emit = defineEmits(['select'])

const filter = ref('')
const expandedOids = ref(new Set(['1', '1.3', '1.3.6', '1.3.6.1']))
const focusedOid = ref(null)

// Empty string = synthetic root via GET /v1/snmp-mib
const { data: rootChildren, isLoading: isRootLoading } = useMibChildren(ref(''))

const OID_PATTERN = /^\d[\d.]*$/

watch(filter, (value) => {
  const v = value.trim()
  if (!v) return
  if (OID_PATTERN.test(v)) {
    const parts = v.split('.')
    const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join('.'))
    const next = new Set(expandedOids.value)
    prefixes.forEach((p) => next.add(p))
    expandedOids.value = next
  }
})

function toggle(oid) {
  const next = new Set(expandedOids.value)
  if (next.has(oid)) {
    next.delete(oid)
  } else {
    next.add(oid)
  }
  expandedOids.value = next
}

function selectNode(oid, name) {
  focusedOid.value = oid
  emit('select', oid, name)
}

function handleFocus(oid) {
  focusedOid.value = oid
}

const treeScrollRef = ref(null)

function getVisibleItems() {
  return Array.from(treeScrollRef.value?.querySelectorAll('.mib-tree-item') ?? [])
}

function focusItemByOid(oid) {
  const el = treeScrollRef.value?.querySelector(`[data-oid="${oid}"]`)
  if (el) {
    el.focus()
    el.scrollIntoView({ block: 'nearest' })
  }
}

// Children of a first-time expanded node render after an async query, so focus the first one
// once it appears.
let pendingObserver = null

onBeforeUnmount(() => pendingObserver?.disconnect())

function focusFirstChildOf(parentOid) {
  function tryFocus() {
    const items = getVisibleItems()
    const idx = items.findIndex((el) => el.dataset.oid === parentOid)
    const candidate = items[idx + 1]
    if (candidate?.dataset.oid?.startsWith(parentOid + '.')) {
      focusedOid.value = candidate.dataset.oid
      candidate.focus()
      candidate.scrollIntoView({ block: 'nearest' })
      return true
    }
    return false
  }

  if (tryFocus()) return

  const container = treeScrollRef.value
  if (!container) return

  pendingObserver?.disconnect()
  const timeout = setTimeout(() => pendingObserver?.disconnect(), 2000)
  pendingObserver = new MutationObserver(() => {
    if (tryFocus()) {
      pendingObserver.disconnect()
      clearTimeout(timeout)
    }
  })
  pendingObserver.observe(container, { childList: true, subtree: true })
}

function onKeyDown(event) {
  const items = getVisibleItems()
  if (!items.length) return

  const currentIdx = items.findIndex((el) => el.dataset.oid === focusedOid.value)

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    const next = items[currentIdx + 1] ?? items[0]
    focusedOid.value = next.dataset.oid
    next.focus()
    next.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const prev = items[currentIdx - 1] ?? items[items.length - 1]
    focusedOid.value = prev.dataset.oid
    prev.focus()
    prev.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (focusedOid.value) {
      const next = new Set(expandedOids.value)
      next.add(focusedOid.value)
      expandedOids.value = next
      focusFirstChildOf(focusedOid.value)
    }
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (focusedOid.value) {
      if (expandedOids.value.has(focusedOid.value)) {
        const next = new Set(expandedOids.value)
        next.delete(focusedOid.value)
        expandedOids.value = next
      } else {
        const parts = focusedOid.value.split('.')
        if (parts.length > 1) {
          const parentOid = parts.slice(0, -1).join('.')
          focusedOid.value = parentOid
          nextTick(() => focusItemByOid(parentOid))
        }
      }
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (focusedOid.value) {
      const el = treeScrollRef.value?.querySelector(`[data-oid="${focusedOid.value}"]`)
      if (el) el.click()
    }
  }
}

const nameFilter = computed(() => {
  const v = filter.value.trim().toLowerCase()
  if (!v || OID_PATTERN.test(v)) return ''
  return v
})
</script>

<template>
  <div class="mib-browser">
    <div class="browser-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filter"
          data-filter-input
          placeholder="Filter by name or OID..."
          size="small"
          class="browser-filter"
        />
      </IconField>
    </div>
    <div
      ref="treeScrollRef"
      class="browser-scroll"
      role="tree"
      aria-label="MIB tree"
      tabindex="0"
      @keydown="onKeyDown"
      @focus.self="
        () => {
          if (!focusedOid && rootChildren?.length) focusedOid = rootChildren[0].oid
        }
      "
    >
      <div v-if="isRootLoading" class="browser-loading" role="presentation">
        <Skeleton v-for="i in 5" :key="i" height="1.5rem" class="mb-1" />
      </div>
      <MibTreeNode
        v-for="node in rootChildren"
        v-else
        :key="node.oid"
        :oid="node.oid"
        :name="node.name"
        :has-children="node.hasChildren"
        :depth="0"
        :selected-oid="selectedOid"
        :focused-oid="focusedOid"
        :expanded-oids="expandedOids"
        :name-filter="nameFilter"
        @toggle="toggle"
        @select="selectNode"
        @focus="handleFocus"
      />
    </div>
  </div>
</template>

<style scoped>
.mib-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.browser-toolbar {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.browser-filter {
  width: 100%;
}

.browser-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
  outline: none;
}

.browser-loading {
  padding: 0.5rem;
}
</style>
