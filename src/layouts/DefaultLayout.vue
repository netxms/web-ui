<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNavigation from '@/components/layout/AppNavigation.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import RegionFocusHint from '@/components/layout/RegionFocusHint.vue'
import ObjectIconPreviewBar from '@/components/objects/ObjectIconPreviewBar.vue'
import { useLayout } from '@/composables/useLayout'
import { useAlarmFeed } from '@/composables/useAlarmFeed'
import { useRegionFocus } from '@/composables/useRegionFocus'
import { useFilterShortcut } from '@/composables/useFilterShortcut'
import { useModuleRuntime } from '@/modules'
import { provideObjectIcons } from '@/composables/useObjectIcons'

useAlarmFeed()

// One shared custom-icon registry for the signed-in session instead of one per row.
provideObjectIcons()

useModuleRuntime()

// F6 pane cycling between the layout's landmark regions. `activeRegion` is the pane F6 last
// moved to.
const { activeRegion } = useRegionFocus()

// Resolves by walking out from the focused element, so views register nothing.
useFilterShortcut()

const route = useRoute()
const { isSidebarVisible, isSidebarCollapsed, setSidebarVisible, toggleSidebarCollapsed } =
  useLayout()

watch(
  () => route.meta.sidebar,
  (value) => setSidebarVisible(!!value),
  { immediate: true },
)

const showSidebar = computed(() => isSidebarVisible.value && !isSidebarCollapsed.value)

const layoutClass = computed(() => ({
  'default-layout': true,
  'sidebar-hidden': !showSidebar.value,
  'sidebar-collapsed': isSidebarVisible.value && isSidebarCollapsed.value,
}))

const isFullBleed = computed(() => !!route.meta.fullBleed)
</script>

<template>
  <div :class="layoutClass">
    <AppHeader class="layout-header" />
    <AppNavigation class="layout-nav" />
    <AppSidebar v-show="showSidebar" class="layout-sidebar" />
    <button
      v-if="isSidebarVisible && isSidebarCollapsed"
      class="layout-sidebar-reopen"
      type="button"
      aria-label="Show sidebar"
      v-tooltip.right="'Show sidebar'"
      @click="toggleSidebarCollapsed"
    >
      <i class="pi pi-chevron-right" />
    </button>
    <!-- tabindex="-1" so a navigation can put the keyboard here; it is never a tab stop. -->
    <main
      class="layout-main"
      :class="{ 'layout-main--full-bleed': isFullBleed }"
      tabindex="-1"
      aria-label="Content"
    >
      <div class="layout-main-inner">
        <!-- Only the routed view, so a crashing view leaves navigation usable. -->
        <ErrorBoundary :reset-key="route.path">
          <router-view />
        </ErrorBoundary>
      </div>
    </main>
    <RegionFocusHint :region="activeRegion" />
    <ObjectIconPreviewBar class="layout-footer" />
  </div>
</template>

<style>
.default-layout {
  display: grid;
  grid-template-areas:
    'header header header'
    'nav sidebar main'
    'footer footer footer';
  grid-template-rows: auto 1fr auto;
  grid-template-columns: auto auto 1fr;
  height: 100%;
}

/*
 * Panes take focus only from script (F6, navigation), so a ring on them marks nothing. The F6
 * target is excluded here rather than overridden: `:focus` outweighs an attribute selector.
 */
.default-layout > main:not([data-region-focus]):focus,
.default-layout > aside:not([data-region-focus]):focus,
.default-layout > nav:not([data-region-focus]):focus,
.default-layout > [role='banner']:not([data-region-focus]):focus {
  outline: none;
}

/* Inset outline: takes no space and is not clipped at the window edge. */
.default-layout > [data-region-focus] {
  outline: 1px solid var(--p-primary-color);
  outline-offset: -1px;
}

/* Windows high contrast throws user colours away; `Highlight` is the system's own. */
@media (forced-colors: active) {
  .default-layout > [data-region-focus] {
    outline-color: Highlight;
  }
}

.layout-header {
  grid-area: header;
}

.layout-nav {
  grid-area: nav;
}

.layout-sidebar {
  grid-area: sidebar;
}

.layout-main {
  grid-area: main;
  overflow: auto;
  padding: 1rem;
  padding-bottom: 0rem;
}

.layout-main--full-bleed {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.layout-main-inner {
  height: 100%;
}

.layout-main--full-bleed .layout-main-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.layout-footer {
  grid-area: footer;
}

.sidebar-hidden {
  grid-template-columns: auto 0 1fr;
}

.sidebar-collapsed {
  grid-template-columns: auto 1rem 1fr;
}

.layout-sidebar-reopen {
  grid-area: sidebar;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.75rem;
  border: none;
  border-right: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
  cursor: pointer;
}

.layout-sidebar-reopen:hover {
  color: var(--p-primary-color);
  background: var(--p-surface-ground);
}
</style>
