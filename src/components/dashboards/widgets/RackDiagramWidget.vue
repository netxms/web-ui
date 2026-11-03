<script setup>
import { computed, ref } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import RackCanvas from '@/components/rack/RackCanvas.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { computeFitScale } from '@/components/rack/rackUtils.js'
import { useElementSize } from '@/composables/useElementSize'
import { useObjectActionMenu } from '@/composables/useObjectActionMenu'
import { useRackLayout } from '@/queries/useObjectQueries'
import { useImagesByGuid } from '@/queries/useImageLibraryQueries'
import { objectTarget } from '@/utils/routeTargets'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const effectiveObjectId = useEffectiveObjectId(() => cfg.value.objectId)
const objectId = computed(() => effectiveObjectId.value || null)

const { data: rackLayout, isLoading, isError, error, refetch } = useRackLayout(objectId)
// Only the images this view places, not the whole image library.
const rackImageGuids = computed(() => {
  const guids = new Set()
  for (const el of rackLayout.value?.elements ?? []) {
    if (el.frontImageGuid) guids.add(el.frontImageGuid)
    if (el.backImageGuid) guids.add(el.backImageGuid)
  }
  return [...guids]
})

const { data: rackImageUrls } = useImagesByGuid(rackImageGuids)
const resolvedImages = computed(() => rackImageUrls.value ?? {})

// RackCanvas has no rear-only rendering, so REAR (view 2) shows both panels.
const rackMode = computed(() => (cfg.value.view === 1 ? 'front' : 'front-back'))

// The rack is laid out at natural size and scaled down uniformly to fit, rather than scrolled.
// ResizeObserver reports layout sizes, which a transform does not affect, so there is no
// feedback loop.

/** px per rack unit before scaling */
const NATURAL_ROW_HEIGHT = 24
/** Below this the widget scrolls instead. */
const MIN_SCALE = 0.25

const viewportRef = ref(null)
const rackRef = ref(null)
const { width: viewportWidth, height: viewportHeight } = useElementSize(viewportRef)
const { width: naturalWidth, height: naturalHeight } = useElementSize(rackRef)

const scale = computed(() =>
  computeFitScale(
    { width: viewportWidth.value, height: viewportHeight.value },
    { width: naturalWidth.value, height: naturalHeight.value },
    MIN_SCALE,
  ),
)

const isClamped = computed(() => scale.value <= MIN_SCALE && naturalHeight.value > 0)

/** Occupies the scaled size, so the widget gets no phantom scrollbars. */
const fitBoxStyle = computed(() => {
  if (!naturalWidth.value || !naturalHeight.value) return {}
  return {
    width: `${naturalWidth.value * scale.value}px`,
    height: `${naturalHeight.value * scale.value}px`,
  }
})

const rackStyle = computed(() => ({ transform: `scale(${scale.value})` }))

const rackName = computed(() => rackLayout.value?.name || 'Rack')
const rackRoute = computed(() =>
  objectId.value
    ? objectTarget({ id: objectId.value }, 'rack', { perspective: 'infrastructure' })
    : null,
)

const usedSlots = computed(() =>
  (rackLayout.value?.elements ?? []).reduce((sum, el) => sum + el.heightU, 0),
)
const freeSlots = computed(() => Math.max(0, (rackLayout.value?.height ?? 0) - usedSlots.value))

// Placed objects get the standard object menu, the background gets the rack's; passive
// elements (PDUs, patch panels) have no object and no menu.

const menuRef = ref(null)
const menuLabel = ref('')
const { objectId: menuObjectId, buildItems } = useObjectActionMenu('rack')

const menuItems = computed(() => buildItems({ label: menuLabel.value }))

function openMenuFor(event, id, label) {
  menuObjectId.value = id
  menuLabel.value = label
  menuRef.value?.show(event)
}

function onElementContextMenu(event, element) {
  if (!element.objectId) return
  openMenuFor(event, element.objectId, element.objectName || element.label)
}

function onRackContextMenu(event) {
  if (!objectId.value) return
  event.preventDefault()
  openMenuFor(event, objectId.value, rackName.value)
}
</script>

<template>
  <div class="rack-diagram-widget">
    <div v-if="!objectId" class="rdw-state">
      <i class="pi pi-server" />
      <span>No rack configured</span>
    </div>
    <div v-else-if="isLoading" class="rdw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="rdw-state rdw-state--error">
      <QueryErrorState :error="error" message="Failed to load rack layout" @retry="refetch" />
    </div>
    <template v-else>
      <div class="rdw-toolbar">
        <AppLink v-if="rackRoute" :to="rackRoute" class="rdw-rack-link">
          <i class="pi pi-external-link" />
          <span class="rdw-rack-link__name">{{ rackName }}</span>
        </AppLink>
        <span class="rdw-occupancy">{{ usedSlots }}U used &middot; {{ freeSlots }}U free</span>
      </div>
      <!-- The right-click handler is the rack's own menu. -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <div
        ref="viewportRef"
        class="rdw-scroll"
        :class="{ 'rdw-scroll--clamped': isClamped }"
        @contextmenu="onRackContextMenu"
      >
        <div class="rdw-fit" :style="fitBoxStyle">
          <div ref="rackRef" class="rdw-fit__inner" :style="rackStyle">
            <RackCanvas
              :rack-height="rackLayout?.height ?? 42"
              :rack-mode="rackMode"
              :elements="rackLayout?.elements ?? []"
              :resolved-images="resolvedImages"
              :row-height="NATURAL_ROW_HEIGHT"
              @element-contextmenu="onElementContextMenu"
              @slot-contextmenu="onRackContextMenu"
            />
          </div>
        </div>
      </div>
    </template>

    <ActionContextMenu ref="menuRef" :items="menuItems" />
  </div>
</template>

<style scoped>
.rack-diagram-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rdw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.125rem 0.25rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  min-width: 0;
}

.rdw-rack-link {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  color: var(--p-text-color);
  font-weight: 500;
}

.rdw-rack-link:hover {
  color: var(--p-primary-color);
  text-decoration: underline;
}

.rdw-rack-link i {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
}

.rdw-rack-link__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rdw-occupancy {
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.rdw-scroll {
  flex: 1;
  min-height: 0;
  /* The panels are white cards and need a ground to read against. */
  background: var(--p-surface-ground);
  padding: 0.5rem;
  /* Nothing scrolls until the scale is clamped. */
  overflow: hidden;
  display: flex;
  justify-content: center;
  justify-content: safe center;
  align-items: flex-start;
}

.rdw-scroll--clamped {
  overflow: auto;
}

.rdw-fit {
  position: relative;
  flex: none;
}

/* Out of flow and sized by the drawing, so what is measured is the rack, not the widget. */
.rdw-fit__inner {
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
  transform-origin: top left;
}

.rdw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.rdw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.rdw-state--error {
  color: var(--p-red-400, #f87171);
}
</style>
