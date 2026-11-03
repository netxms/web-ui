<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import ObjectTreeNode from '@/components/objects/ObjectTreeNode.vue'
import MapNodeFigure from '@/components/network-maps/MapNodeFigure.vue'
import MapIconMasks from '@/components/network-maps/MapIconMasks.vue'
import { useObjectIcons, providePreviewObjectIcons } from '@/composables/useObjectIcons'
import { useTheme } from '@/composables/useTheme'
import { useObjectIconStore } from '@/stores/objectIconStore'
import { ICON_SURFACE, builtinIconComponent, customImageGuid, validGuid } from '@/utils/objectIcons'
import { ICON_STYLE, IMAGE_ROLE, iconQualityHints } from '@/utils/iconImageAnalysis'
import { MAP_OBJECT_DISPLAY_MODES } from '@/utils/networkMapNodeVisual'
import { NODE_BORDER_WIDTH, mapIconSurface, paintMapNode } from '@/utils/networkMapNodePaint'
import { resolveMapRenderOptions } from '@/utils/networkMapUtils'

/**
 * Previews draft custom images on the real tree row and map figure. The theme button flips
 * the console's actual theme: PrimeVue's light tokens exist only on `:root` and the status
 * palette keys off `html.app-dark`, so a wrapper class cannot fake it.
 *
 * Category mode (`categoryId`, `iconImageId`, `mapImageId`) or one object's own map image
 * (`object`, `mapImageId`, maps only).
 */
const props = defineProps({
  /** 0 for a category not created yet. Ignored with `object`. */
  categoryId: { type: Number, default: 0 },
  /** Ignored with `object`. */
  iconImageId: { type: String, default: null },
  mapImageId: { type: String, default: null },
  object: { type: Object, default: null },
  sampleName: { type: String, default: '' },
  /** Category mode, saved categories only. */
  canPreviewInConsole: { type: Boolean, default: false },
})

const emit = defineEmits(['preview-in-console'])

const { isDark, themeIcon, toggleTheme } = useTheme()
const store = useObjectIconStore()

/** Stands in for the id of a category not created yet. */
const PLACEHOLDER_CATEGORY_ID = -1
const sampleCategoryId = computed(() =>
  props.object ? (props.object.category ?? 0) : props.categoryId || PLACEHOLDER_CATEGORY_ID,
)

const base = useObjectIcons()
const registry = base
  ? providePreviewObjectIcons(
      base,
      () =>
        props.object
          ? null
          : {
              categoryId: sampleCategoryId.value,
              iconImageId: validGuid(props.iconImageId),
              mapImageId: validGuid(props.mapImageId),
            },
      () => [props.mapImageId],
    )
  : null

const sample = computed(() => {
  if (props.object) return { ...props.object, mapImage: validGuid(props.mapImageId) }
  return {
    id: -1,
    class: 'Node',
    name: props.sampleName.trim() || 'sample-node',
    category: sampleCategoryId.value,
    status: 0,
    children: [],
  }
})

// The map image in effect may be the category's; maps load theirs only on demand.
registry?.want(() => [
  customImageGuid(sample.value, ICON_SURFACE.MAP, registry.categoriesById.value),
])

const NO_EXPANDED = new Set()

const treeRows = computed(() => [
  { caption: 'Normal', node: { ...sample.value, id: -11, status: 0 }, selected: false },
  { caption: 'Selected', node: { ...sample.value, id: -12, status: 0 }, selected: true },
  { caption: 'Major', node: { ...sample.value, id: -13, status: 3 }, selected: false },
  { caption: 'Unmanaged', node: { ...sample.value, id: -14, status: 6 }, selected: false },
  {
    caption: 'Maintenance',
    node: { ...sample.value, id: -15, status: 0, isInMaintenanceMode: true },
    selected: false,
  },
])

const MAP_SAMPLES = [
  { key: 'icon-normal', mode: MAP_OBJECT_DISPLAY_MODES.ICON, status: 0, caption: 'Icon' },
  { key: 'icon-major', mode: MAP_OBJECT_DISPLAY_MODES.ICON, status: 3, caption: 'Icon, major' },
  { key: 'small', mode: MAP_OBJECT_DISPLAY_MODES.SMALL_LABEL, status: 0, caption: 'Small label' },
  { key: 'large', mode: MAP_OBJECT_DISPLAY_MODES.LARGE_LABEL, status: 1, caption: 'Large label' },
]

const FIGURE_CENTER_Y = 32
const FIGURE_HEIGHT = 80

let textContext = null
function measureText(text, fontSize = 11, fontWeight = 400) {
  if (!textContext) textContext = document.createElement('canvas').getContext('2d')
  if (!textContext) return text.length * fontSize * 0.6
  const family = getComputedStyle(document.body).fontFamily
  textContext.font = `${fontWeight} ${fontSize}px ${family}`
  return textContext.measureText(text).width
}

const element = computed(() => ({
  type: 'object',
  objectClass: sample.value.class,
  objectCategory: sample.value.category ?? 0,
  objectMapImage: sample.value.mapImage ?? null,
  objectCapabilities: sample.value.capabilities ?? null,
  objectIpAddress: sample.value.ipAddress?.address ?? '10.0.0.1',
}))

function resolveIcon(surface) {
  return registry
    ? registry.resolve(element.value, surface)
    : { kind: 'builtin', component: builtinIconComponent(element.value, surface) }
}

const figures = computed(() =>
  MAP_SAMPLES.map((spec) => {
    const options = resolveMapRenderOptions({ objectDisplayMode: spec.mode })
    const painted = paintMapNode({
      element: element.value,
      displayName: sample.value.name,
      status: spec.status,
      options,
      measureText,
      dark: isDark.value,
    })
    const plate = painted.visual.plate
    const width = Math.ceil(Math.max(painted.visual.width, plate?.width ?? 0)) + 8
    return {
      ...spec,
      width,
      node: {
        ...painted,
        x: width / 2,
        y: FIGURE_CENTER_Y,
        name: sample.value.name,
        displayName: sample.value.name,
        dimmed: false,
        boxStroke: { color: painted.stroke, width: NODE_BORDER_WIDTH },
        icon: resolveIcon(mapIconSurface(spec.mode)),
      },
    }
  }),
)

const maskPrefix = `object-icon-preview-${Math.random().toString(36).slice(2, 8)}`

const glyphMasks = computed(() => {
  const byGuid = new Map()
  for (const figure of figures.value) {
    const icon = figure.node.icon
    if (icon.kind === ICON_STYLE.GLYPH) byGuid.set(icon.guid, { guid: icon.guid, url: icon.url })
  }
  return [...byGuid.values()]
})

const STYLE_TEXT = {
  [ICON_STYLE.GLYPH]:
    "One colour on a transparent background, so it is drawn in the console's own icon colours and follows the theme, selection and status like the standard icons.",
  [ICON_STYLE.PICTURE]:
    'Drawn in its own colours. It cannot change colour with the theme or the status; on maps that show status by icon colour, a status dot is added to its corner.',
}

const imageReports = computed(() => {
  if (!registry) return []
  const reports = []
  if (!props.object) {
    reports.push({ key: 'icon', title: 'Icon', role: IMAGE_ROLE.ICON, guid: props.iconImageId })
  }
  const mapGuid = props.object
    ? customImageGuid(sample.value, ICON_SURFACE.MAP, registry.categoriesById.value)
    : props.mapImageId
  const inherited = !!props.object && !validGuid(props.mapImageId) && !!mapGuid
  reports.push({ key: 'map', title: 'Map image', role: IMAGE_ROLE.MAP, guid: mapGuid, inherited })
  return reports.map((report) => {
    const state = registry.imageState(report.guid)
    return {
      ...report,
      state,
      hints: state.analysis
        ? iconQualityHints(state.analysis, {
            role: report.role,
            byteSize: state.blobInfo?.size ?? null,
          })
        : [],
    }
  })
})

const pictureNote = computed(
  () =>
    !props.object &&
    imageReports.value.some((report) => report.state.analysis?.style === ICON_STYLE.PICTURE),
)

const iconOnlyNote = computed(
  () => !props.object && !!validGuid(props.iconImageId) && !validGuid(props.mapImageId),
)
</script>

<template>
  <section class="icon-preview" aria-label="Icon preview">
    <header class="icon-preview__header">
      <span class="icon-preview__title">Preview</span>
      <span class="icon-preview__header-actions">
        <Button
          v-tooltip.bottom="'Switches the whole console'"
          :label="isDark ? 'Light mode' : 'Dark mode'"
          :icon="themeIcon"
          text
          size="small"
          severity="secondary"
          @click="toggleTheme"
        />
        <Button
          v-if="canPreviewInConsole"
          v-tooltip.bottom="'Show these images everywhere before saving them'"
          label="Preview in console"
          icon="pi pi-eye"
          text
          size="small"
          @click="emit('preview-in-console')"
        />
      </span>
    </header>

    <div class="icon-preview__samples" inert>
      <div v-if="!object" class="icon-preview__group">
        <span class="icon-preview__group-label">Object tree and lists</span>
        <div class="icon-preview__tree">
          <template v-for="row in treeRows" :key="row.node.id">
            <span class="icon-preview__caption">{{ row.caption }}</span>
            <ObjectTreeNode
              :node="row.node"
              :expanded-ids="NO_EXPANDED"
              :selected-path="row.selected ? String(row.node.id) : null"
            />
          </template>
        </div>
      </div>

      <div class="icon-preview__group">
        <span class="icon-preview__group-label">Network maps</span>
        <div class="icon-preview__map">
          <svg class="icon-preview__defs" width="0" height="0" aria-hidden="true">
            <MapIconMasks :icons="glyphMasks" :prefix="maskPrefix" />
          </svg>
          <figure v-for="figure in figures" :key="figure.key" class="icon-preview__figure">
            <svg
              :width="figure.width"
              :height="FIGURE_HEIGHT"
              :viewBox="`0 0 ${figure.width} ${FIGURE_HEIGHT}`"
              aria-hidden="true"
            >
              <MapNodeFigure :node="figure.node" :mask-prefix="maskPrefix" />
            </svg>
            <figcaption class="icon-preview__caption">{{ figure.caption }}</figcaption>
          </figure>
        </div>
      </div>
    </div>

    <ul class="icon-preview__notes">
      <li v-if="!store.showCustom" class="icon-preview__note">
        <i class="pi pi-info-circle" />
        Custom object icons are switched off in your Preferences, so outside this preview you see
        the standard icons.
      </li>
      <li v-if="pictureNote" class="icon-preview__note">
        <i class="pi pi-info-circle" />
        For icons drawn exactly like the console's own, add the icon pack in Configuration, Image
        Library, and choose from its "Icons" category.
      </li>
      <li v-if="iconOnlyNote" class="icon-preview__note">
        <i class="pi pi-info-circle" />
        Network maps draw the map image, not the icon. Without one they show the standard icons, as
        above.
      </li>
      <li v-for="report in imageReports" :key="report.key" class="icon-preview__report">
        <span class="icon-preview__report-title">
          {{ report.title }}<template v-if="report.inherited"> (from the category)</template>
        </span>
        <span v-if="!report.state.guid" class="icon-preview__report-text">
          Not set: the standard icons are shown.
        </span>
        <span v-else-if="report.state.missing" class="icon-preview__report-text is-warning">
          <i class="pi pi-exclamation-triangle" />
          This image is no longer in the image library, so the standard icons are shown.
        </span>
        <span v-else-if="report.state.loading" class="icon-preview__report-text">
          Checking the image…
        </span>
        <template v-else>
          <span class="icon-preview__report-text">{{
            STYLE_TEXT[report.state.analysis.style]
          }}</span>
          <span
            v-for="hint in report.hints"
            :key="hint.id"
            class="icon-preview__report-text is-warning"
          >
            <i class="pi pi-exclamation-triangle" />
            {{ hint.text }}
          </span>
        </template>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.icon-preview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md, 6px);
  background: var(--p-surface-ground);
}

.icon-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.icon-preview__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.icon-preview__header-actions {
  display: flex;
  gap: 0.25rem;
}

.icon-preview__samples {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.icon-preview__group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.icon-preview__group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.icon-preview__tree {
  display: grid;
  grid-template-columns: auto 14rem;
  align-items: center;
  column-gap: 0.5rem;
  padding: 0.25rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  background: var(--p-surface-card);
}

.icon-preview__map {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  background: var(--p-surface-card);
}

.icon-preview__defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.icon-preview__figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
}

.icon-preview__caption {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.icon-preview__notes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.icon-preview__note {
  display: flex;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.icon-preview__note .pi {
  margin-top: 0.125rem;
  font-size: 0.75rem;
}

.icon-preview__report {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.icon-preview__report-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.icon-preview__report-text {
  display: flex;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.icon-preview__report-text.is-warning {
  color: var(--p-text-color);
}

.icon-preview__report-text.is-warning .pi {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: var(--netxms-status-minor);
}
</style>
