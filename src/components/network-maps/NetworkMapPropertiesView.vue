<script setup>
import { ref, reactive, computed, watch, provide, onBeforeUnmount, defineAsyncComponent } from 'vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import PropertiesSectionNav from '@/components/properties/PropertiesSectionNav.vue'
import NetworkMapOptionsSection from './property-sections/NetworkMapOptionsSection.vue'
import NetworkMapSeedObjectsSection from './property-sections/NetworkMapSeedObjectsSection.vue'
import NetworkMapBackgroundSection from './property-sections/NetworkMapBackgroundSection.vue'
import NetworkMapLinksSection from './property-sections/NetworkMapLinksSection.vue'
import NetworkMapObjectFilterSection from './property-sections/NetworkMapObjectFilterSection.vue'
import NetworkMapLinkStylingScriptSection from './property-sections/NetworkMapLinkStylingScriptSection.vue'
import NetworkMapAdvancedSection from './property-sections/NetworkMapAdvancedSection.vue'
import { usePropertyEditor } from '@/composables/usePropertyEditor'
import { useObjectPropertiesEditor } from '@/composables/useObjectPropertiesEditor'
import { getSectionsForClass } from '@/config/propertySections'
import {
  MAP_LINK_COLOR_SOURCES,
  MAP_BACKGROUND_NONE,
  MAP_BACKGROUND_GEOMAP,
  bgrIntToHex,
  safeBgrIntToHex,
  hexToBgrInt,
  parseMapFlags,
  serializeMapFlags,
} from '@/utils/networkMapAdapters'
import { MAP_TYPE_LABELS, MAP_TYPE_CUSTOM } from '@/utils/networkMapUtils'
import {
  configuredMergeThreshold,
  DEFAULT_LINK_MERGE_THRESHOLD,
} from '@/utils/networkMapParallelLinks'

/**
 * Docked drawer for a network map's content settings. The map canvas previews edits through
 * the `preview` event; the parent owns persistence and the drawer width.
 */
const props = defineProps({
  /** The working copy while editing layout, else the fetched map. */
  map: { type: Object, required: true },
  /** async (rawContentPatch) => Promise */
  persist: { type: Function, required: true },
  width: { type: Number, default: 480 },
  /** In layout edit mode Save commits the whole draft (layout + settings) in one PUT. */
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'preview', 'update:width', 'update:geoActive'])

const MIN_WIDTH = 340
const MAX_WIDTH = 900

const rootEl = ref(null)

function startResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startW = rootEl.value?.offsetWidth ?? props.width
  function onMove(ev) {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (startX - ev.clientX)))
    emit('update:width', next)
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const COLOR_SOURCES = MAP_LINK_COLOR_SOURCES

const SECTION_COMPONENTS = {
  options: NetworkMapOptionsSection,
  seed: NetworkMapSeedObjectsSection,
  background: NetworkMapBackgroundSection,
  links: NetworkMapLinksSection,
  filter: NetworkMapObjectFilterSection,
  linkScript: NetworkMapLinkStylingScriptSection,
  advanced: NetworkMapAdvancedSection,
}

const BASE_SECTIONS = [
  { id: 'options', label: 'Map Options', icon: 'pi pi-sliders-h', group: 'Map' },
  { id: 'seed', label: 'Seed Objects', icon: 'pi pi-sitemap', group: 'Map' },
  { id: 'background', label: 'Background', icon: 'pi pi-image', group: 'Appearance' },
  { id: 'links', label: 'Links', icon: 'pi pi-share-alt', group: 'Appearance' },
  { id: 'filter', label: 'Object Filter', icon: 'pi pi-filter', group: 'Scripts' },
  { id: 'linkScript', label: 'Link Styling Script', icon: 'pi pi-code', group: 'Scripts' },
  { id: 'advanced', label: 'Advanced', icon: 'pi pi-cog', group: 'Advanced' },
]

const mapType = computed(() => props.map?.mapType ?? props.map?.rawContent?.mapType ?? 0)
const isCustomMap = computed(() => mapType.value === MAP_TYPE_CUSTOM)
const mapTypeLabel = computed(() => MAP_TYPE_LABELS[mapType.value] ?? 'Map')

const GENERIC_SECTION_IDS = [
  'general',
  'access-rights',
  'custom-attributes',
  'map-appearance',
  'responsible-users',
  'status-calculation',
  'trusted-objects',
  'auto-bind',
]
const genericSections = computed(() =>
  getSectionsForClass('NetworkMap')
    .filter((s) => GENERIC_SECTION_IDS.includes(s.id))
    .map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      group: 'Object',
      component: s.component,
    })),
)

const mapContentSections = computed(() =>
  BASE_SECTIONS.filter((s) => s.id !== 'seed' || !isCustomMap.value),
)
const sections = computed(() => [...mapContentSections.value, ...genericSections.value])

const activeSection = ref('options')
const activeSectionMeta = computed(
  () => sections.value.find((s) => s.id === activeSection.value) ?? sections.value[0],
)
const isGenericSection = computed(() => GENERIC_SECTION_IDS.includes(activeSectionMeta.value?.id))
const activeComponent = computed(() => {
  const id = activeSectionMeta.value?.id
  if (SECTION_COMPONENTS[id]) return SECTION_COMPONENTS[id]
  const def = genericSections.value.find((s) => s.id === id)
  return def ? defineAsyncComponent(def.component) : null
})

// Access Control's stacked fallback is a viewport @media query, which cannot see the drawer
// width, so the drawer widens when the section opens.
const WIDE_SECTIONS = new Set(['access-rights'])
const WIDE_MIN_WIDTH = 680
function selectSection(id) {
  activeSection.value = id
  if (WIDE_SECTIONS.has(id) && props.width < WIDE_MIN_WIDTH) {
    emit('update:width', WIDE_MIN_WIDTH)
  }
}

const NORMAL_SECTION_MIN_WIDTH = 280
const WIDE_SECTION_MIN_WIDTH = 480
const activeSectionMinWidth = computed(() =>
  WIDE_SECTIONS.has(activeSectionMeta.value?.id)
    ? WIDE_SECTION_MIN_WIDTH
    : NORMAL_SECTION_MIN_WIDTH,
)

function backgroundTypeOf(uuid) {
  if (!uuid || uuid === MAP_BACKGROUND_NONE) return 'none'
  if (uuid === MAP_BACKGROUND_GEOMAP) return 'geo'
  return 'image'
}
function resolveBackgroundUuid(d) {
  if (d.backgroundType === 'geo') return MAP_BACKGROUND_GEOMAP
  if (d.backgroundType === 'image') return d.backgroundImage || MAP_BACKGROUND_NONE
  return MAP_BACKGROUND_NONE
}

const settingsSource = computed(() => {
  const rc = props.map?.rawContent ?? {}
  const linkMergeThreshold = configuredMergeThreshold(props.map)
  return {
    id: props.map?.id,
    canvasType: rc.canvasType ?? 0,
    objectDisplayMode: rc.objectDisplayMode ?? 0,
    displayPriority: rc.displayPriority ?? 0,
    initialViewMode: rc.initialViewMode ?? 0,
    seedObjects: Array.isArray(rc.seedObjects) ? [...rc.seedObjects] : [],
    discoveryRadius: rc.discoveryRadius ?? 0,
    useCustomRadius: (rc.discoveryRadius ?? 0) > 0,
    defaultLinkRouting: rc.defaultLinkRouting ?? 0,
    defaultLinkStyle: rc.defaultLinkStyle ?? 0,
    // Older servers spell the key "defaultLinkWidht"
    defaultLinkWidth: rc.defaultLinkWidth ?? rc.defaultLinkWidht ?? 0,
    flags: parseMapFlags(rc.flags),
    defaultLinkColorSource: rc.defaultLinkColorSource ?? COLOR_SOURCES.DEFAULT,
    defaultLinkColor: safeBgrIntToHex(rc.defaultLinkColor) ?? '#3b82f6',
    // 0 = never merge; switching merging on starts from the default (legacy MapOptions)
    mergeParallelLinks: linkMergeThreshold > 0,
    linkMergeThreshold: linkMergeThreshold || DEFAULT_LINK_MERGE_THRESHOLD,
    backgroundType: backgroundTypeOf(rc.background),
    backgroundImage: backgroundTypeOf(rc.background) === 'image' ? rc.background : null,
    backgroundColor: bgrIntToHex(rc.backgroundColor ?? 0xffffff),
    backgroundLatitude: rc.backgroundLatitude ?? 0,
    backgroundLongitude: rc.backgroundLongitude ?? 0,
    backgroundZoom: rc.backgroundZoom ?? 1,
    width: rc.width ?? 0,
    height: rc.height ?? 0,
    filter: rc.filter ?? '',
    linkScript: rc.linkScript ?? '',
  }
})

function buildRawContentPatch(d) {
  return {
    canvasType: d.canvasType,
    objectDisplayMode: d.objectDisplayMode ?? 0,
    displayPriority: d.displayPriority ?? 0,
    initialViewMode: d.initialViewMode ?? 0,
    seedObjects: [...(d.seedObjects ?? [])],
    // 0 means "use server default"
    discoveryRadius: d.useCustomRadius ? (d.discoveryRadius ?? 0) : 0,
    defaultLinkRouting: d.defaultLinkRouting ?? 0,
    defaultLinkColorSource: d.defaultLinkColorSource,
    defaultLinkStyle: d.defaultLinkStyle ?? 0,
    // Both spellings: the server's PUT whitelist drops the one its version does not know.
    defaultLinkWidth: d.defaultLinkWidth ?? 0,
    defaultLinkWidht: d.defaultLinkWidth ?? 0,
    // Boolean-object form, so the server leaves unmodeled MF_* bits untouched
    flags: serializeMapFlags(d.flags),
    linkMergeThreshold: d.mergeParallelLinks
      ? (d.linkMergeThreshold ?? DEFAULT_LINK_MERGE_THRESHOLD)
      : 0,
    background: resolveBackgroundUuid(d),
    backgroundColor: hexToBgrInt(d.backgroundColor),
    backgroundLatitude: d.backgroundLatitude ?? 0,
    backgroundLongitude: d.backgroundLongitude ?? 0,
    backgroundZoom: d.backgroundZoom ?? 1,
    width: d.width ?? 0,
    height: d.height ?? 0,
    filter: d.filter ?? '',
    linkScript: d.linkScript ?? '',
    // BGR int; only overwritten when the source is Custom
    defaultLinkColor:
      d.defaultLinkColorSource === COLOR_SOURCES.CUSTOM
        ? hexToBgrInt(d.defaultLinkColor)
        : (props.map.rawContent?.defaultLinkColor ?? 0),
  }
}

const { draft, isDirty, isSaving, saveError, save, cancel } = usePropertyEditor(settingsSource, {
  onSave: async (data) => {
    await props.persist(buildRawContentPatch(data))
  },
})

// The map object's generic properties have their own editor and save path, side by side with
// the map-content editor.
const objEditor = useObjectPropertiesEditor(computed(() => props.map?.id))
const objDraft = objEditor.draft
const objObject = objEditor.object
const objectReady = computed(() => !!objObject.value)

const anyDirty = computed(() => isDirty.value || objEditor.isDirty.value)
const anySaving = computed(() => isSaving.value || objEditor.isSaving.value)
const anyError = computed(() => saveError.value || objEditor.saveError.value)

async function saveAll() {
  const objectSaved = await objEditor.save()
  const settingsSaved = await save()
  return objectSaved && settingsSaved
}
async function saveAllAndClose() {
  if (await saveAll()) emit('close')
}
function cancelAll() {
  objEditor.cancel()
  cancel()
}

watch(draft, (value) => emit('preview', buildRawContentPatch(value)), {
  deep: true,
  immediate: true,
})

// "Pick on map": while active the canvas lets the geographic backdrop be dragged and reports
// the new center through setGeoCenter.
const geoPick = reactive({
  active: false,
  toggle() {
    geoPick.active = !geoPick.active
  },
})
provide('mapGeoPick', geoPick)

watch(
  () => draft.value.backgroundType,
  (type) => {
    if (type !== 'geo') geoPick.active = false
  },
)
// The toggle lives in the Background section; pick mode must not outlive it.
watch(activeSection, (id) => {
  if (id !== 'background') geoPick.active = false
})
watch(
  () => geoPick.active,
  (active) => emit('update:geoActive', active),
)

function setGeoCenter(lat, lon) {
  draft.value.backgroundLatitude = lat
  draft.value.backgroundLongitude = lon
}

defineExpose({ setGeoCenter, isDirty })

onBeforeUnmount(() => {
  emit('preview', null)
  emit('update:geoActive', false)
})
</script>

<template>
  <div ref="rootEl" class="properties-view network-map-properties">
    <div class="np-resize-handle" title="Drag to resize" @pointerdown="startResize" />
    <header class="np-header">
      <div class="np-header-title">
        <span class="np-title">Map Properties</span>
        <span class="np-subtitle">{{ map.name }} · {{ mapTypeLabel }}</span>
      </div>
      <Button
        icon="pi pi-times"
        size="small"
        text
        rounded
        severity="secondary"
        aria-label="Close properties"
        @click="emit('close')"
      />
    </header>

    <div class="properties-layout">
      <PropertiesSectionNav
        :sections="sections"
        :active-section="activeSectionMeta?.id"
        @select="selectSection"
      />

      <div class="properties-form">
        <div class="properties-form-content">
          <div class="np-form-grid" :style="{ minWidth: activeSectionMinWidth + 'px' }">
            <div class="np-section">
              <!-- Generic sections read the separately fetched object draft. -->
              <div v-if="isGenericSection && !objectReady" class="np-loading">
                <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
              </div>
              <Suspense v-else>
                <template #default>
                  <component
                    :is="activeComponent"
                    :draft="isGenericSection ? objDraft : draft"
                    :object="isGenericSection ? (objObject ?? map) : map"
                    :section-id="activeSectionMeta?.id ?? ''"
                    :section-label="activeSectionMeta?.label ?? ''"
                  />
                </template>
                <template #fallback>
                  <div class="np-loading">
                    <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
                  </div>
                </template>
              </Suspense>
            </div>
          </div>
        </div>

        <div class="properties-footer" :class="{ dirty: anyDirty }">
          <div class="footer-status">
            <span v-if="anyDirty && editMode" class="dirty-indicator"
              >Unsaved — saving applies all map edits</span
            >
            <span v-else-if="anyDirty" class="dirty-indicator">Unsaved changes</span>
            <span v-if="anyError" class="save-error">{{ anyError }}</span>
          </div>
          <div class="footer-actions">
            <Button
              label="Discard"
              severity="secondary"
              text
              size="small"
              :disabled="!anyDirty || anySaving"
              @click="cancelAll"
            />
            <Button
              label="Apply"
              severity="secondary"
              outlined
              size="small"
              :disabled="!anyDirty"
              :loading="anySaving"
              @click="saveAll"
            />
            <Button
              label="Save & Close"
              size="small"
              :disabled="!anyDirty"
              :loading="anySaving"
              @click="saveAllAndClose"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="@/assets/styles/properties.css" />

<style scoped>
.network-map-properties {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-card);
}

.np-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
  touch-action: none;
}

.np-resize-handle:hover {
  background: var(--p-primary-color);
  opacity: 0.3;
}

.properties-layout :deep(.section-nav) {
  width: 9.5rem;
}

.np-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.np-header-title {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}

.np-title {
  font-size: 0.9375rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.np-subtitle {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.properties-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.properties-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.properties-form-content {
  flex: 1;
  /* Both axes: sections keep a min-width, so a narrow drawer scrolls horizontally. */
  overflow: auto;
  padding: 1rem;
}

.np-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

.np-section {
  min-width: 0;
}

.np-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 0;
}

.properties-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.properties-footer.dirty {
  border-top-color: var(--p-primary-200);
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.dirty-indicator {
  color: var(--p-primary-color);
  font-weight: 500;
}

.save-error {
  color: var(--p-red-500);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
