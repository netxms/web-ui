<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, useId } from 'vue'
import { useRouter } from 'vue-router'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { resolveActions, flattenActions } from '@/composables/useActions'
import { actionRegistry } from '@/actions'
import { useObjectTree } from '@/queries/useObjectQueries'
import { useAlarms } from '@/queries/useAlarmQueries'
import { useDashboardTree } from '@/queries/useDashboardQueries'
import { useNetworkMapTree } from '@/queries/useNetworkMapQueries'
import { useMacAddressSearch } from '@/queries/useFindQueries'
import { usePermissions } from '@/composables/usePermissions'
import { parseMacQuery, isMacRefinementOf } from '@/utils/macAddress'
import { getClassIcon, getStatusInfo } from '@/utils/objectUtils'
import AppLink from '@/components/common/AppLink.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import MacAddressResults from './MacAddressResults.vue'
import { userPrefs } from '@/utils/appStorage'
import {
  objectTarget,
  alarmTarget,
  dashboardTarget,
  mapTarget,
  configTarget,
  macSearchTarget,
  objectQueryTarget,
} from '@/utils/routeTargets'

const router = useRouter()
const store = useGlobalSearchStore()
const selectionStore = useSelectionStore()
const { can } = usePermissions()

const query = ref('')
const focusedIndex = ref(0)
const searchInput = ref(null)
const resultsEl = ref(null)

const INFRA_ROOT_ID = 2

// Already cached by other views, no extra cost
const { data: infraTree } = useObjectTree(INFRA_ROOT_ID)
const { data: alarms } = useAlarms()
const { data: dashboardTree } = useDashboardTree()
const { data: mapTree } = useNetworkMapTree()

const CONFIG_SECTIONS = [
  {
    id: 'users-groups/users',
    sectionId: 'users-groups',
    tabId: 'users',
    label: 'Users',
    icon: 'pi pi-user',
  },
  {
    id: 'users-groups/groups',
    sectionId: 'users-groups',
    tabId: 'groups',
    label: 'Groups',
    icon: 'pi pi-users',
  },
  {
    id: 'event-processing',
    label: 'Event Processing',
    icon: 'pi pi-sitemap',
    keywords: ['event processing policy', 'policies', 'epp'],
  },
  { id: 'event-templates', label: 'Event Templates', icon: 'pi pi-bolt' },
  { id: 'object-tools', label: 'Object Tools', icon: 'pi pi-wrench' },
  { id: 'script-library', label: 'Script Library', icon: 'pi pi-code' },
  { id: 'persistent-storage', label: 'Persistent Storage', icon: 'pi pi-database' },
  { id: 'mapping-tables', label: 'Mapping Tables', icon: 'pi pi-arrow-right-arrow-left' },
  {
    id: 'snmp-trap-mappings',
    label: 'SNMP Traps',
    icon: 'pi pi-inbox',
    keywords: ['snmp traps', 'trap configuration'],
  },
  {
    id: 'agent-tunnels',
    label: 'Agent Tunnels',
    icon: 'pi pi-arrows-h',
    keywords: ['tunnels', 'tunnel manager', 'bind agent'],
  },
  { id: 'notification-channels', label: 'Notification Channels', icon: 'pi pi-bell' },
  { id: 'image-library', label: 'Image Library', icon: 'pi pi-image' },
  { id: 'scheduled-tasks', label: 'Scheduled Tasks', icon: 'pi pi-calendar' },
  { id: 'ssh-keys', label: 'SSH Keys', icon: 'pi pi-key' },
  { id: 'two-factor-auth', label: 'Two-Factor Auth', icon: 'pi pi-shield' },
  { id: 'dci-summary-tables', label: 'DCI Summary Tables', icon: 'pi pi-table' },
  { id: 'web-service-definitions', label: 'Web Service Definitions', icon: 'pi pi-link' },
  { id: 'object-categories', label: 'Object Categories', icon: 'pi pi-tag' },
  { id: 'actions', label: 'Server Actions', icon: 'pi pi-play' },
  { id: 'geographical-areas', label: 'Geographical Areas', icon: 'pi pi-map-marker' },
  // Not component-gated: they follow the AI Assistant config section, which is not gated either.
  {
    id: 'ai-assistant/tasks',
    sectionId: 'ai-assistant',
    tabId: 'tasks',
    label: 'AI Tasks',
    icon: 'pi pi-list-check',
    keywords: ['ai tasks'],
  },
  {
    id: 'ai-assistant/skills',
    sectionId: 'ai-assistant',
    tabId: 'skills',
    label: 'Skills & Functions',
    icon: 'pi pi-cog',
    keywords: ['ai skills'],
  },
  {
    id: 'ai-assistant/prompts',
    sectionId: 'ai-assistant',
    tabId: 'prompts',
    label: 'AI Prompts',
    icon: 'pi pi-bookmark',
    keywords: ['ai prompts'],
  },
]

function flattenTree(items) {
  if (!items?.length) return []
  const result = []
  for (const item of items) {
    result.push(item)
    if (item.children?.length) result.push(...flattenTree(item.children))
  }
  return result
}

const q = computed(() => query.value.toLowerCase().trim())
const showRecent = computed(() => q.value.length < 2)

const objectResults = computed(() => {
  if (showRecent.value) return []
  return flattenTree(infraTree.value)
    .filter(
      (o) =>
        o.name.toLowerCase().includes(q.value) ||
        (o.alias && o.alias.toLowerCase().includes(q.value)),
    )
    .slice(0, 5)
})

const alarmResults = computed(() => {
  if (showRecent.value || !alarms.value) return []
  return alarms.value
    .filter(
      (a) =>
        a.message?.toLowerCase().includes(q.value) || a.sourceName?.toLowerCase().includes(q.value),
    )
    .slice(0, 5)
})

const dashboardResults = computed(() => {
  if (showRecent.value) return []
  const seen = new Set()
  return flattenTree(dashboardTree.value)
    .filter((d) => {
      if (d.class !== 'Dashboard') return false
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return d.name.toLowerCase().includes(q.value)
    })
    .slice(0, 5)
})

const mapResults = computed(() => {
  if (showRecent.value) return []
  const seen = new Set()
  return flattenTree(mapTree.value)
    .filter((m) => {
      if (m.class !== 'NetworkMap') return false
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return m.name.toLowerCase().includes(q.value)
    })
    .slice(0, 5)
})

const configResults = computed(() => {
  if (showRecent.value) return []
  return CONFIG_SECTIONS.filter(
    (s) =>
      s.label.toLowerCase().includes(q.value) || s.keywords?.some((kw) => kw.includes(q.value)),
  ).slice(0, 5)
})

const actionTarget = computed(() => selectionStore.primaryObject)

const actionResults = computed(() => {
  if (showRecent.value || !actionTarget.value) return []
  const resolved = resolveActions(actionRegistry.getActions(['object']), {
    object: actionTarget.value,
    viewContext: 'objectTree',
  })
  return flattenActions(resolved)
    .filter((a) => a.pathLabel.toLowerCase().includes(q.value))
    .slice(0, 5)
})

// MAC search walks switch forwarding databases on the server, so it runs on explicit submit
// (Enter or the Search button sets `submittedMac`), not per keystroke.

/** Set when the user rejects an auto-detected MAC, cleared as soon as the text changes. */
const macDismissed = ref(false)
const submittedMac = ref(null)

const macQuery = computed(() => parseMacQuery(query.value))
const macMode = computed(
  () => macQuery.value.isMac && !macDismissed.value && can.value.searchNetwork,
)

/** True when the hits on screen answer exactly the text in the box. */
const macFresh = computed(() => macMode.value && submittedMac.value === macQuery.value.normalized)

// Hits stay up while the address is being edited; the `q` watcher releases `submittedMac`.
const macShowing = computed(() => !!submittedMac.value && !showRecent.value)

/** Showing hits for an address other than the one currently typed. */
const macStale = computed(() => macShowing.value && !macFresh.value)

const {
  data: macHits,
  isFetching: macFetching,
  error: macError,
} = useMacAddressSearch(submittedMac)

const MAC_PALETTE_LIMIT = 5

const macAllHits = computed(() => (macShowing.value ? (macHits.value ?? []) : []))
const macTotal = computed(() => macAllHits.value.length)
const macOverflow = computed(() => macTotal.value > MAC_PALETTE_LIMIT)

const macResults = computed(() => macAllHits.value.slice(0, MAC_PALETTE_LIMIT))

const macGroupContext = computed(() => {
  const parts = []
  if (macStale.value) parts.push(`for ${submittedMac.value}`)
  if (macTotal.value) parts.push(`${macTotal.value} found`)
  return parts.join(' · ')
})

function submitMacSearch() {
  if (!macMode.value) return
  submittedMac.value = macQuery.value.normalized
}

function dismissMacMode() {
  macDismissed.value = true
  submittedMac.value = null
  nextTick(() => searchInput.value?.$el?.focus())
}

// Offsets for flat keyboard navigation; the "see all" rows are real slots.
const macMoreIndex = computed(() => macResults.value.length)
const objectOffset = computed(() => macResults.value.length + (macOverflow.value ? 1 : 0))

// Always offered: the cached Infrastructure tree lacks interfaces, templates and business
// services, so a local miss says nothing about the full search.
const objectOverflow = computed(() => !showRecent.value)
const objectMoreIndex = computed(() => objectOffset.value + objectResults.value.length)
const alarmOffset = computed(() => objectMoreIndex.value + (objectOverflow.value ? 1 : 0))
const dashboardOffset = computed(() => alarmOffset.value + alarmResults.value.length)
const mapOffset = computed(() => dashboardOffset.value + dashboardResults.value.length)
const configOffset = computed(() => mapOffset.value + mapResults.value.length)
const actionOffset = computed(() => configOffset.value + configResults.value.length)
const totalResults = computed(() => actionOffset.value + actionResults.value.length)

/** Matches found, excluding the handoff rows. */
const matchCount = computed(
  () => totalResults.value - (objectOverflow.value ? 1 : 0) - (macOverflow.value ? 1 : 0),
)

// MAC mode renders its own prompt and empty state.
const noResults = computed(
  () => !showRecent.value && matchCount.value === 0 && !macMode.value && !macShowing.value,
)

const flatResults = computed(() => [
  ...macResults.value.map((d) => ({ type: 'mac', data: d })),
  ...(macOverflow.value ? [{ type: 'mac-more', data: { mac: submittedMac.value } }] : []),
  ...objectResults.value.map((d) => ({ type: 'object', data: d })),
  ...(objectOverflow.value ? [{ type: 'object-more', data: { text: query.value.trim() } }] : []),
  ...alarmResults.value.map((d) => ({ type: 'alarm', data: d })),
  ...dashboardResults.value.map((d) => ({ type: 'dashboard', data: d })),
  ...mapResults.value.map((d) => ({ type: 'map', data: d })),
  ...configResults.value.map((d) => ({ type: 'config', data: d })),
  ...actionResults.value.map((d) => ({ type: 'action', data: d })),
])

const RECENT_PREF = 'recentSearchItems'
const recentItems = ref([])

function loadRecent() {
  const stored = userPrefs.get(RECENT_PREF, [])
  return Array.isArray(stored) ? stored : []
}

const OBJECT_RECENT_TYPES = new Set(['object', 'dashboard', 'map'])

// The stored icon is the class's; the trees have the object's current category.
const recentObjects = computed(() => {
  const wanted = new Set(
    recentItems.value.filter((r) => OBJECT_RECENT_TYPES.has(r.type)).map((r) => r.id),
  )
  const found = new Map()
  if (!wanted.size) return found
  for (const tree of [infraTree.value, dashboardTree.value, mapTree.value]) {
    for (const object of flattenTree(tree)) {
      if (wanted.has(object.id)) found.set(object.id, object)
    }
  }
  return found
})

function recentObjectOf(item) {
  return OBJECT_RECENT_TYPES.has(item.type) ? (recentObjects.value.get(item.id) ?? null) : null
}

function saveToRecent(item) {
  const items = loadRecent().filter((r) => !(r.type === item.type && r.id === item.id))
  items.unshift(item)
  const trimmed = items.slice(0, 5)
  userPrefs.set(RECENT_PREF, trimmed)
  recentItems.value = trimmed
}

watch(q, () => {
  focusedIndex.value = 0
  macDismissed.value = false

  if (submittedMac.value && !isMacRefinementOf(query.value, submittedMac.value)) {
    submittedMac.value = null
  }
})

watch(
  () => store.isOpen,
  (open) => {
    if (open) {
      query.value = ''
      focusedIndex.value = 0
      macDismissed.value = false
      submittedMac.value = null
      recentItems.value = loadRecent()
    }
  },
)

function onDialogShow() {
  nextTick(() => searchInput.value?.$el?.focus())
}

function targetForResult(type, data) {
  if (type === 'object') return objectTarget(data, undefined, { perspective: 'infrastructure' })
  if (type === 'mac') {
    const object = data.localNode ?? data.node
    return object ? objectTarget(object) : null
  }
  if (type === 'mac-more') return macSearchTarget(data.mac)
  if (type === 'object-more') return objectQueryTarget({ text: data.text })
  if (type === 'alarm') return alarmTarget()
  if (type === 'dashboard') return dashboardTarget(data.id)
  if (type === 'map') return mapTarget(data.id)
  if (type === 'config')
    return configTarget(data.sectionId ?? data.id, { tab: data.tabId ?? undefined })
  return null
}

function recentForResult(type, data) {
  if (type === 'object')
    return { type, id: data.id, label: data.name, icon: getClassIcon(data.class) }
  if (type === 'alarm') return { type, id: data.id, label: data.message, icon: 'pi pi-bell' }
  if (type === 'dashboard') return { type, id: data.id, label: data.name, icon: 'pi pi-th-large' }
  if (type === 'map') return { type, id: data.id, label: data.name, icon: 'pi pi-map' }
  if (type === 'config')
    return {
      type,
      id: data.id,
      label: data.label,
      icon: data.icon,
      sectionId: data.sectionId,
      tabId: data.tabId,
    }
  return null
}

function selectResult(type, data) {
  if (type === 'action') {
    store.close()
    data.command({ item: data })
    return
  }

  const route = targetForResult(type, data)
  if (route) {
    const recent = recentForResult(type, data)
    if (recent) saveToRecent(recent)
    router.push(route)
    store.close()
  }
}

// Rows are AppLinks, which already navigated.
function onResultActivate(type, data) {
  const recent = recentForResult(type, data)
  if (recent) saveToRecent(recent)
  store.close()
}

function selectRecentItem(item) {
  const route = routeForItem(item)
  saveToRecent(item)
  router.push(route)
  store.close()
}

function onRecentActivate(item) {
  saveToRecent(item)
  store.close()
}

function routeForItem(item) {
  return targetForResult(item.type, item) ?? { name: 'home' }
}

// Combobox: the input keeps DOM focus and names the current row via `aria-activedescendant`.

const uid = useId()
const listboxId = `${uid}-results`
const optionId = (index) => `${uid}-option-${index}`
const groupLabelId = (name) => `${uid}-group-${name}`

const listLen = computed(() =>
  showRecent.value ? recentItems.value.length : flatResults.value.length,
)

const activeOptionId = computed(() =>
  listLen.value > 0 ? optionId(focusedIndex.value) : undefined,
)

// Rows are not tab stops: the input is the single keyboard entry point.
function optionBindings(index) {
  return {
    id: optionId(index),
    role: 'option',
    tabindex: -1,
    'aria-selected': focusedIndex.value === index,
    onMouseenter: () => {
      focusedIndex.value = index
    },
  }
}

/** For the live region: screen readers do not revisit status rows inside the listbox. */
const statusMessage = computed(() => {
  if (showRecent.value) return ''
  if (macMode.value && !macFresh.value)
    return `Press Enter to search for ${macQuery.value.normalized}`
  if (macShowing.value && macFetching.value) return 'Searching the network'
  if (noResults.value) return `No results for ${query.value}`
  if (matchCount.value === 0) return ''
  return `${matchCount.value} result${matchCount.value === 1 ? '' : 's'}`
})

function scrollFocused() {
  nextTick(() => {
    resultsEl.value
      ?.querySelector('.search-result-item.is-focused, .mac-row.is-focused')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function handleInputKeydown(e) {
  // First Enter on an armed MAC query runs the search; checked before the empty-list guard.
  if (e.key === 'Enter' && macMode.value && !macFresh.value) {
    e.preventDefault()
    submitMacSearch()
    return
  }

  if (listLen.value === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusedIndex.value = (focusedIndex.value + 1) % listLen.value
    scrollFocused()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusedIndex.value = (focusedIndex.value - 1 + listLen.value) % listLen.value
    scrollFocused()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (showRecent.value) {
      const item = recentItems.value[focusedIndex.value]
      if (item) selectRecentItem(item)
    } else {
      const result = flatResults.value[focusedIndex.value]
      if (result) selectResult(result.type, result.data)
    }
  }
}

function handleGlobalKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (store.isOpen) {
      store.close()
    } else {
      store.open()
    }
  }
}

onMounted(() => document.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleGlobalKeydown))
</script>

<template>
  <!-- Top-anchored: centred, the input would jump on every keystroke that changes the height. -->
  <Dialog
    v-model:visible="store.isOpen"
    :modal="true"
    :draggable="false"
    :closable="false"
    :dismissable-mask="true"
    position="top"
    class="global-search-dialog"
    :pt="{
      root: { style: 'width: 600px; max-width: 92vw; overflow: hidden; margin-top: 10vh' },
      header: { style: 'display: none' },
      content: { style: 'padding: 0; overflow: hidden' },
    }"
    @show="onDialogShow"
  >
    <div class="search-input-row">
      <i class="pi pi-search search-icon" />
      <!-- mousedown.prevent keeps the caret in the input, so arrow keys still work after. -->
      <button
        v-if="macMode"
        type="button"
        class="mac-chip"
        title="Search as text instead"
        @mousedown.prevent
        @click="dismissMacMode"
      >
        MAC
        <i class="pi pi-times mac-chip-x" />
      </button>
      <InputText
        ref="searchInput"
        v-model="query"
        aria-label="Search"
        placeholder="Search objects, alarms, dashboards…"
        class="search-input"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="listLen > 0"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        @keydown="handleInputKeydown"
      />
      <button
        v-if="macMode && !macFresh"
        type="button"
        class="mac-search-btn"
        @mousedown.prevent
        @click="submitMacSearch"
      >
        Search
      </button>
      <kbd v-else class="search-kbd">Esc</kbd>
    </div>

    <!-- Outside the listbox, which may only contain options and groups. -->
    <div class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</div>

    <div
      :id="listboxId"
      ref="resultsEl"
      class="search-results"
      role="listbox"
      aria-label="Search results"
    >
      <template v-if="showRecent">
        <div v-if="recentItems.length === 0" class="search-placeholder" role="presentation">
          <i class="pi pi-search" />
          <span>Type to search objects, alarms, dashboards, and more…</span>
        </div>
        <div v-else role="group" :aria-labelledby="groupLabelId('recent')">
          <div :id="groupLabelId('recent')" class="search-group-label">Recent</div>
          <AppLink
            v-for="(item, idx) in recentItems"
            :key="`recent-${item.type}-${item.id}`"
            v-bind="optionBindings(idx)"
            :to="routeForItem(item)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === idx }"
            @activate="onRecentActivate(item)"
          >
            <ObjectIcon
              v-if="recentObjectOf(item)"
              :object="recentObjectOf(item)"
              size="1rem"
              class="item-icon"
            />
            <i v-else :class="item.icon" class="item-icon" />
            <span class="item-label">{{ item.label }}</span>
            <span class="item-type-tag">{{ item.type }}</span>
          </AppLink>
        </div>
      </template>

      <template v-else>
        <div v-if="macShowing" :id="groupLabelId('mac')" class="search-group-label">
          MAC Addresses
          <span v-if="macGroupContext" class="search-group-context">{{ macGroupContext }}</span>
        </div>

        <!-- Armed but not yet run. -->
        <div
          v-if="macMode && !macFresh"
          class="search-placeholder mac-prompt"
          :class="{ 'mac-prompt-compact': macShowing }"
          role="presentation"
        >
          <i class="pi pi-search" />
          <span>
            Press <kbd>↵</kbd> to search the network for
            <strong>{{ macQuery.normalized }}</strong>
            <template v-if="macQuery.isPartial"> (prefix)</template>
          </span>
        </div>

        <div
          v-if="macShowing"
          role="group"
          :aria-labelledby="groupLabelId('mac')"
          :class="{ 'mac-group-stale': macStale }"
        >
          <MacAddressResults
            :hits="macResults"
            :is-loading="macFetching"
            :error="macError"
            :focused-index="focusedIndex"
            :offset="0"
            :option-bindings="optionBindings"
            @activate="onResultActivate('mac', $event)"
          />

          <AppLink
            v-if="macOverflow"
            v-bind="optionBindings(macMoreIndex)"
            :to="macSearchTarget(submittedMac)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === macMoreIndex }"
            @activate="store.close()"
          >
            <i class="pi pi-table item-icon" />
            <span class="item-label">See all {{ macTotal }} results</span>
            <span class="item-type-tag">table</span>
          </AppLink>
        </div>

        <div v-if="objectResults.length" role="group" :aria-labelledby="groupLabelId('objects')">
          <div :id="groupLabelId('objects')" class="search-group-label">Objects</div>
          <AppLink
            v-for="(obj, idx) in objectResults"
            :key="`obj-${obj.id}`"
            v-bind="optionBindings(objectOffset + idx)"
            :to="targetForResult('object', obj)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === objectOffset + idx }"
            @activate="onResultActivate('object', obj)"
          >
            <ObjectIcon :object="obj" size="1rem" class="item-icon" />
            <span class="item-label">{{ obj.name }}</span>
            <span v-if="obj.alias" class="item-subtitle">{{ obj.alias }}</span>
            <span
              class="item-badge"
              :style="{
                background: getStatusInfo(obj.status).bgColor,
                color: getStatusInfo(obj.status).textColor,
              }"
              >{{ getStatusInfo(obj.status).label }}</span
            >
          </AppLink>
        </div>

        <AppLink
          v-if="objectOverflow"
          v-bind="optionBindings(objectMoreIndex)"
          :to="targetForResult('object-more', { text: query.trim() })"
          class="search-result-item"
          :class="{ 'is-focused': focusedIndex === objectMoreIndex }"
          @activate="store.close()"
        >
          <i class="pi pi-filter item-icon" />
          <span class="item-label">Find every object matching "{{ query.trim() }}"</span>
          <span class="item-type-tag">table</span>
        </AppLink>

        <div v-if="alarmResults.length" role="group" :aria-labelledby="groupLabelId('alarms')">
          <div :id="groupLabelId('alarms')" class="search-group-label">Alarms</div>
          <AppLink
            v-for="(alarm, idx) in alarmResults"
            :key="`alarm-${alarm.id}`"
            v-bind="optionBindings(alarmOffset + idx)"
            :to="targetForResult('alarm', alarm)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === alarmOffset + idx }"
            @activate="onResultActivate('alarm', alarm)"
          >
            <i class="pi pi-bell item-icon" />
            <span class="item-label">{{ alarm.message }}</span>
            <span class="item-subtitle">{{ alarm.sourceName }}</span>
            <span
              class="item-badge"
              :style="{
                background: getStatusInfo(alarm.severity).bgColor,
                color: getStatusInfo(alarm.severity).textColor,
              }"
              >{{ getStatusInfo(alarm.severity).label }}</span
            >
          </AppLink>
        </div>

        <div
          v-if="dashboardResults.length"
          role="group"
          :aria-labelledby="groupLabelId('dashboards')"
        >
          <div :id="groupLabelId('dashboards')" class="search-group-label">Dashboards</div>
          <AppLink
            v-for="(dash, idx) in dashboardResults"
            :key="`dash-${dash.id}`"
            v-bind="optionBindings(dashboardOffset + idx)"
            :to="targetForResult('dashboard', dash)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === dashboardOffset + idx }"
            @activate="onResultActivate('dashboard', dash)"
          >
            <ObjectIcon :object="dash" size="1rem" class="item-icon" />
            <span class="item-label">{{ dash.name }}</span>
          </AppLink>
        </div>

        <div v-if="mapResults.length" role="group" :aria-labelledby="groupLabelId('maps')">
          <div :id="groupLabelId('maps')" class="search-group-label">Network Maps</div>
          <AppLink
            v-for="(map, idx) in mapResults"
            :key="`map-${map.id}`"
            v-bind="optionBindings(mapOffset + idx)"
            :to="targetForResult('map', map)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === mapOffset + idx }"
            @activate="onResultActivate('map', map)"
          >
            <ObjectIcon :object="map" size="1rem" class="item-icon" />
            <span class="item-label">{{ map.name }}</span>
          </AppLink>
        </div>

        <div v-if="configResults.length" role="group" :aria-labelledby="groupLabelId('config')">
          <div :id="groupLabelId('config')" class="search-group-label">Configuration</div>
          <AppLink
            v-for="(section, idx) in configResults"
            :key="`cfg-${section.id}`"
            v-bind="optionBindings(configOffset + idx)"
            :to="targetForResult('config', section)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === configOffset + idx }"
            @activate="onResultActivate('config', section)"
          >
            <i :class="section.icon" class="item-icon" />
            <span class="item-label">{{ section.label }}</span>
          </AppLink>
        </div>

        <!-- Actions run in place, so this is the one group that is not links. -->
        <div v-if="actionResults.length" role="group" :aria-labelledby="groupLabelId('actions')">
          <div :id="groupLabelId('actions')" class="search-group-label">
            Actions
            <span class="search-group-context">on {{ actionTarget.name }}</span>
          </div>
          <!-- The rules cannot see role/tabindex through v-bind; keys go through the input. -->
          <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
          <div
            v-for="(action, idx) in actionResults"
            :key="`action-${action.id}`"
            v-bind="optionBindings(actionOffset + idx)"
            class="search-result-item"
            :class="{ 'is-focused': focusedIndex === actionOffset + idx }"
            @click="selectResult('action', action)"
          >
            <i :class="action.icon || 'pi pi-bolt'" class="item-icon" />
            <span class="item-label">{{ action.label }}</span>
            <span v-if="action.path.length" class="item-subtitle">{{
              action.path.join(' > ')
            }}</span>
          </div>
        </div>

        <div v-if="noResults" class="search-placeholder" role="presentation">
          <i class="pi pi-search-minus" />
          <span>No results for "{{ query }}"</span>
        </div>
      </template>
    </div>

    <div class="search-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>Esc</kbd> close</span>
      <span class="footer-shortcut-hint"><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
    </div>
  </Dialog>
</template>

<style scoped>
.search-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.search-icon {
  color: var(--p-text-muted-color);
  font-size: 1rem;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  font-size: 1rem;
  padding: 0.25rem 0;
  outline: none;
}

.search-kbd {
  font-family: inherit;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  color: var(--p-text-muted-color);
  background: var(--p-surface-100);
  flex-shrink: 0;
}

.mac-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--p-primary-color);
  border-radius: 4px;
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  cursor: pointer;
  flex-shrink: 0;
}

.mac-chip:hover {
  background: color-mix(in srgb, var(--p-primary-color) 22%, transparent);
}

.mac-chip-x {
  font-size: 0.6rem;
}

.mac-search-btn {
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--p-primary-color);
  border-radius: 4px;
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
  cursor: pointer;
  flex-shrink: 0;
}

.mac-search-btn:hover {
  filter: brightness(1.08);
}

.mac-prompt-compact {
  justify-content: flex-start;
  padding: 0.35rem 1rem 0.5rem;
  font-size: 0.8125rem;
}

/* Hits for an address other than the one in the box. */
.mac-group-stale {
  opacity: 0.65;
}

.mac-prompt kbd {
  font-family: inherit;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 3px;
  background: var(--p-surface-card);
  font-size: 0.7rem;
}

.search-results {
  max-height: 380px;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.search-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
  padding: 0.5rem 1rem 0.25rem;
}

.search-group-context {
  margin-left: 0.375rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  opacity: 0.75;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: background 0.1s;
}

.search-result-item:hover,
.search-result-item.is-focused {
  background: var(--p-content-hover-background);
}

.item-icon {
  font-size: 0.9rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
}

.item-label {
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-subtitle {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
  flex-shrink: 0;
}

.item-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.item-type-tag {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  text-transform: capitalize;
  flex-shrink: 0;
}

.search-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 2.5rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.search-placeholder .pi {
  font-size: 1.1rem;
}

.search-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--p-content-border-color);
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-50);
}

.search-footer kbd {
  font-family: inherit;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 3px;
  background: var(--p-surface-card);
  font-size: 0.7rem;
}

.footer-shortcut-hint {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
</style>
