<script setup>
import { onMounted, computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import { ChevronDown, ChevronUp, FlaskConical } from 'lucide-vue-next'
import { useAiMessageAttention } from '@/composables/useAiMessageAttention'
import { useAlarmAttention } from '@/composables/useAlarmAttention'
import { useLayout } from '@/composables/useLayout'
import { useVerticalOverflow } from '@/composables/useVerticalOverflow'
import { useNavigationStore } from '@/stores/navigationStore'
import { usePerspectiveStore } from '@/stores/perspectiveStore'
import { severityConfig, severityLabels } from '@/utils/alarmDisplay'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'
import RestrictedDisclosure from '@/components/common/RestrictedDisclosure.vue'
const router = useRouter()
const route = useRoute()
const { isNavCollapsed } = useLayout()
const navigationStore = useNavigationStore()
const perspectiveStore = usePerspectiveStore()

// Dev-only entries (UI lab); stripped from production builds.
const devSection = import.meta.env.DEV
  ? {
      id: 'dev',
      placement: 'bottom',
      items: [
        { label: 'Lab', icon: FlaskConical, route: '/dev-lab' },
      ],
    }
  : null

const sections = computed(() =>
  devSection ? [...navigationStore.navSections, devSection] : navigationStore.navSections,
)

const firstFootSection = computed(
  () => sections.value.find((section) => section.placement === 'bottom')?.id,
)

onMounted(() => {
  if (!navigationStore.loaded) {
    navigationStore.loadNavigation()
  }
})

function isActive(item) {
  return route.path.startsWith(item.route)
}

function navigate(event, item) {
  // A new tab gets item.route: the remembered path is this tab's in-memory history.
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  // Already there: the remembered path would jump away from the current location.
  if (isActive(item)) return
  const saved = perspectiveStore.getLastPath(item.route)
  router.push(saved || item.route)
}

function hrefFor(item) {
  return resolveHref(item.route)
}

const { count: aiMessageCount } = useAiMessageAttention()
const { count: alarmCount, worstSeverity } = useAlarmAttention()

const attention = computed(() => ({
  '/ai': { count: aiMessageCount.value },
  '/alarms': { count: alarmCount.value, severity: worstSeverity.value },
}))

/** @returns {string|undefined} what waits in the perspective; PrimeVue's Button takes a string */
function badgeFor(item) {
  const count = attention.value[item.route]?.count
  if (!count) return undefined
  return count > 99 ? '99+' : String(count)
}

function badgeStyleFor(item) {
  const severity = attention.value[item.route]?.severity
  if (!severity) return undefined
  const { color, onFillColor } = severityConfig[severity]
  return { '--app-nav-badge-bg': color, '--app-nav-badge-fg': onFillColor }
}

// The narrow rail drops the visible label, and a severity shows only as a color.
function accessibleNameFor(item) {
  const badge = badgeFor(item)
  if (!badge) return item.label
  const severity = attention.value[item.route]?.severity
  const name = `${item.label} ${badge}`
  return severity ? `${name}, worst ${severityLabels[severity]}` : name
}

// The rail's scrollbar is hidden (it clipped the labels), so fades, edge chevrons and an
// off-screen pill carry the overflow cues.

const scrollRef = ref(null)
const contentRef = ref(null)
const { canScrollUp, canScrollDown, targetSide, revealTarget, scrollPage } = useVerticalOverflow(
  scrollRef,
  contentRef,
  '[aria-current="page"]',
)

const activeItem = computed(
  () => sections.value.flatMap((section) => section.items).find(isActive) ?? null,
)

const edges = computed(() =>
  [
    { side: 'above', visible: canScrollUp.value, chevron: ChevronUp, direction: -1 },
    { side: 'below', visible: canScrollDown.value, chevron: ChevronDown, direction: 1 },
  ].filter((edge) => edge.visible),
)

function onEdgeClick(edge) {
  if (targetSide.value === edge.side) revealTarget()
  else scrollPage(edge.direction)
}

// Moves inside one perspective do not re-reveal, so a deliberate scroll stays.
const itemRoutes = computed(() =>
  sections.value.flatMap((section) => section.items.map((item) => item.route)).join(),
)
watch([() => activeItem.value?.route, itemRoutes, isNavCollapsed], revealTarget, {
  flush: 'post',
})
onMounted(revealTarget)
</script>

<template>
  <nav
    class="app-nav"
    :class="{ collapsed: isNavCollapsed, 'icon-stacked': !isNavCollapsed }"
    aria-label="Perspectives"
  >
    <div
      ref="scrollRef"
      class="app-nav-scroll"
      :class="{ 'can-scroll-up': canScrollUp, 'can-scroll-down': canScrollDown }"
    >
      <div ref="contentRef" class="app-nav-content">
        <template v-for="section in sections" :key="section.id">
          <div v-if="section.id === firstFootSection" class="app-nav-spacer" />
          <div class="app-nav-section" role="group" :aria-label="section.label">
            <p v-if="section.label && !isNavCollapsed" class="app-nav-caption">
              {{ section.label }}
            </p>
            <ul class="app-nav-list">
              <li v-for="item in section.items" :key="item.route" class="app-nav-item">
                <Button
                  v-tooltip.right="isNavCollapsed ? item.label : null"
                  as="a"
                  :href="hrefFor(item)"
                  :label="isNavCollapsed ? undefined : item.label"
                  :badge="badgeFor(item)"
                  badge-severity="warn"
                  :style="badgeStyleFor(item)"
                  :aria-label="accessibleNameFor(item)"
                  :text="!isActive(item)"
                  :severity="isActive(item) ? undefined : 'secondary'"
                  :aria-current="isActive(item) ? 'page' : undefined"
                  class="app-nav-button"
                  :class="{ active: isActive(item) }"
                  @click="navigate($event, item)"
                >
                  <template #icon>
                    <component :is="item.icon" :size="20" :stroke-width="1.75" />
                  </template>
                </Button>
              </li>
            </ul>
          </div>
        </template>

        <RestrictedDisclosure
          :items="navigationStore.hiddenItems"
          noun="perspective"
          :icon-only="isNavCollapsed"
        />
      </div>
    </div>

    <!-- Pointer only: keyboard focus already scrolls the list. -->
    <button
      v-for="edge in edges"
      :key="edge.side"
      v-tooltip.right="targetSide === edge.side ? `Scroll to ${activeItem?.label}` : null"
      type="button"
      tabindex="-1"
      aria-hidden="true"
      class="app-nav-edge"
      :class="[`app-nav-edge-${edge.side}`, { 'shows-active': targetSide === edge.side }]"
      @click="onEdgeClick(edge)"
    >
      <component :is="edge.chevron" :size="14" :stroke-width="2" />
      <component
        :is="activeItem.icon"
        v-if="targetSide === edge.side && activeItem"
        :size="16"
        :stroke-width="1.75"
      />
    </button>
  </nav>
</template>

<style scoped>
.app-nav {
  /* --app-nav-fade is also the focus clearance; the composable reads it back from
     `scroll-padding-top`. */
  --app-nav-band: 1.5rem;
  --app-nav-fade: 2.25rem;

  position: relative;
  width: 220px;
  min-height: 0;
  border-right: 1px solid var(--app-nav-border);
  background: var(--app-nav-bg);
  overflow: hidden;
  transition: width 0.2s ease;
  display: flex;
  flex-direction: column;
}

.app-nav.collapsed {
  width: 60px;
}

.app-nav-scroll {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  scroll-padding-block: var(--app-nav-fade);
}

.app-nav-scroll::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .app-nav-scroll {
    scroll-behavior: smooth;
  }
}

.app-nav-content {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

.app-nav-scroll.can-scroll-up {
  mask-image: linear-gradient(
    to bottom,
    transparent var(--app-nav-band),
    black var(--app-nav-fade)
  );
}

.app-nav-scroll.can-scroll-down {
  mask-image: linear-gradient(
    to bottom,
    black calc(100% - var(--app-nav-fade)),
    transparent calc(100% - var(--app-nav-band))
  );
}

.app-nav-scroll.can-scroll-up.can-scroll-down {
  mask-image: linear-gradient(
    to bottom,
    transparent var(--app-nav-band),
    black var(--app-nav-fade),
    black calc(100% - var(--app-nav-fade)),
    transparent calc(100% - var(--app-nav-band))
  );
}

/* Outside the scroller so the mask does not fade it too. */
.app-nav-edge {
  position: absolute;
  left: 50%;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  min-width: 2rem;
  height: 1.25rem;
  padding: 0 0.375rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: var(--app-nav-fg, var(--p-text-muted-color));
  cursor: pointer;
  transform: translateX(-50%);
}

.app-nav-edge-above {
  top: 0.125rem;
}

.app-nav-edge-below {
  bottom: 0.125rem;
}

.app-nav-edge:hover {
  background: color-mix(in srgb, currentColor 20%, transparent);
}

.app-nav-edge.shows-active {
  background: var(--app-nav-active-bg, var(--p-button-primary-background));
  color: var(--app-nav-active-fg, var(--p-button-primary-color));
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
}

.app-nav-edge.shows-active:hover {
  background: var(--app-nav-active-bg, var(--p-button-primary-hover-background));
  color: var(--app-nav-active-fg, var(--p-button-primary-hover-color));
}

.app-nav-section {
  padding: 0.375rem 0;
}

.app-nav-section:not(:first-child) {
  border-top: 1px solid var(--app-nav-border);
}

.app-nav-spacer {
  flex: 1 1 auto;
  min-height: 0.5rem;
}

.app-nav-caption {
  margin: 0;
  padding: 0.125rem 0.75rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-nav-fg, inherit);
  /* Hidden during the width transition, fades in after — matches stacked labels. */
  opacity: 0;
  animation: nav-caption-in 0.15s ease forwards 0.1s;
}

@keyframes nav-caption-in {
  to {
    opacity: 0.55;
  }
}

.app-nav.icon-stacked .app-nav-caption {
  padding-inline: 0.25rem;
  text-align: center;
}

.app-nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

.app-nav-item {
  padding: 0.125rem 0.5rem;
}

.app-nav-button {
  position: relative;
  width: 100%;
  justify-content: flex-start;
  white-space: nowrap;
  overflow: hidden;
  text-decoration: none;
}

.collapsed .app-nav-button {
  padding: 0.5rem 0.75rem;
  overflow: visible;
}

/* Just past the icon's edge, so a count takes no room from the label and moves no other item. */
.app-nav-button :deep(.p-badge) {
  position: absolute;
  top: 0.125rem;
  left: calc(50% + 0.75rem);
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  font-size: 0.625rem;
  line-height: 1rem;
  background: var(--app-nav-badge-bg, var(--p-badge-warn-background));
  color: var(--app-nav-badge-fg, var(--p-badge-warn-color));
}

/* The narrow rail has no room beside the icon: it hangs over the button's edge and grows leftward,
   so only a count of two digits or more touches the icon. */
.collapsed .app-nav-button :deep(.p-badge) {
  left: auto;
  right: -0.375rem;
}

/* The active item's own colors swapped: a fixed badge color would vanish on some theme's fill. */
.app-nav-button.active :deep(.p-badge) {
  background: var(--app-nav-active-fg, var(--p-button-primary-color));
  color: var(--app-nav-active-bg, var(--p-button-primary-background));
}

.app-nav-button.active {
  background: var(--app-nav-active-bg, var(--p-button-primary-background));
  border-color: var(--app-nav-active-bg, var(--p-button-primary-border-color));
  color: var(--app-nav-active-fg, var(--p-button-primary-color));
}

.app-nav-button.active:not(:disabled):hover {
  background: var(--app-nav-active-bg, var(--p-button-primary-hover-background));
  border-color: var(--app-nav-active-bg, var(--p-button-primary-hover-border-color));
  color: var(--app-nav-active-fg, var(--p-button-primary-hover-color));
}

.app-nav.icon-stacked {
  width: 90px;
}

.app-nav.icon-stacked .app-nav-item {
  padding: 0.125rem 0.25rem;
}

.app-nav.icon-stacked .app-nav-button {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: auto;
  padding: 0.5rem 0.25rem;
  gap: 0.2rem;
}

.app-nav.icon-stacked .app-nav-button :deep(.p-button-icon) {
  margin: 0;
}

.app-nav.icon-stacked .app-nav-button :deep(.p-button-icon svg) {
  width: 22px;
  height: 22px;
}

.app-nav.icon-stacked .app-nav-button :deep(.p-button-label) {
  font-size: 0.7rem;
  font-weight: 500;
  white-space: normal;
  text-align: center;
  max-width: 70px;
  /* A single word wider than the cap widens the box instead of spilling out. */
  min-width: min-content;
  line-height: 1.2;
  /* Hidden during the width transition, fades in after */
  opacity: 0;
  animation: nav-stacked-label-in 0.15s ease forwards 0.1s;
}

@keyframes nav-stacked-label-in {
  to {
    opacity: 1;
  }
}

/* Target icon/label directly to override PrimeVue's secondary-button token (can be dimmed) */
.app-nav.icon-stacked :deep(.p-button.p-button-secondary .p-button-icon),
.app-nav.icon-stacked :deep(.p-button.p-button-secondary .p-button-label) {
  color: var(--app-nav-fg, currentColor);
}

.app-nav :deep(.p-button.p-button-secondary.p-button-text) {
  color: var(--app-nav-fg, inherit);
}

.app-nav :deep(.p-button.p-button-secondary.p-button-text:hover),
.app-nav :deep(.p-button.p-button-secondary.p-button-text:focus-visible) {
  background: color-mix(in srgb, var(--app-nav-fg, currentColor) 10%, transparent);
}
</style>
