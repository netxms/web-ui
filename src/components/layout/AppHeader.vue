<script setup>
import { ref, computed } from 'vue'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import { useLayout } from '@/composables/useLayout'
import { useTheme } from '@/composables/useTheme'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { brand } from '@/brands'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import ProfilePanel from './ProfilePanel.vue'
import AboutDialog from './AboutDialog.vue'
import AiChatPanel from './AiChatPanel.vue'

// Two root nodes (Toolbar + ProfilePanel teleport): bind fallthrough attrs on the Toolbar.
defineOptions({ inheritAttrs: false })

const { toggleNav, toggleAiChat, isNavCollapsed } = useLayout()
const { themeIcon, themeLabel, toggleTheme, isHeaderDark } = useTheme()

const headerLogo = computed(() => (isHeaderDark.value ? brand.logo.white : brand.logo.color))

const globalSearch = useGlobalSearchStore()
const profilePanel = ref(null)
const aboutDialog = ref(null)

// The assistant exists only on a server with the AI component (an LLM provider configured);
// otherwise POST /v1/ai/chat answers 503. The panel goes too: it polls and holds chat state.
// Configuration > AI Assistant is deliberately not gated (see configSections.js).
const { has } = useServerComponents()
const aiAvailable = computed(() => has(SERVER_COMPONENTS.AI_ASSISTANT))
</script>

<template>
  <!-- The banner landmark, and the first pane in the F6 cycle (useRegionFocus). -->
  <Toolbar v-bind="$attrs" class="app-header" role="banner">
    <template #start>
      <Button
        :icon="isNavCollapsed ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"
        text
        severity="secondary"
        @click="toggleNav"
        aria-label="Toggle navigation"
      />
      <RouterLink to="/" class="app-header-brand">
        <img :src="headerLogo" alt="" class="app-header-logo" />
        <span v-if="brand.header.divider" class="app-header-divider" aria-hidden="true" />
        <span class="app-header-title">{{ brand.productName }}</span>
      </RouterLink>
    </template>
    <template #end>
      <Button
        icon="pi pi-search"
        text
        severity="secondary"
        aria-label="Search"
        v-tooltip.bottom="'Search (Ctrl+K)'"
        @click="globalSearch.open()"
      />
      <Button
        v-if="aiAvailable"
        icon="pi pi-sparkles"
        text
        severity="secondary"
        aria-label="AI Assistant"
        v-tooltip.bottom="'AI Assistant'"
        @click="toggleAiChat"
      />
      <div class="header-sep" />
      <Button
        :icon="themeIcon"
        text
        severity="secondary"
        :aria-label="themeLabel"
        v-tooltip.bottom="themeLabel"
        @click="toggleTheme"
      />
      <Button
        icon="pi pi-user"
        text
        severity="secondary"
        aria-label="Profile"
        v-tooltip.bottom="'Profile'"
        @click="profilePanel.toggle($event)"
      />
      <Button
        icon="pi pi-info-circle"
        text
        severity="secondary"
        aria-label="System information"
        v-tooltip.bottom="'About'"
        @click="aboutDialog.open()"
      />
    </template>
  </Toolbar>

  <ProfilePanel ref="profilePanel" />
  <AboutDialog ref="aboutDialog" />
  <AiChatPanel v-if="aiAvailable" />
</template>

<style scoped>
.app-header {
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  border-bottom-color: var(--app-header-border);
  padding: 0.5rem 1rem 0.5rem 0.65rem;
  background: var(--app-header-bg);
  color: var(--app-header-fg);
}

.app-header-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--app-header-fg);
  margin-left: 1rem;
}

.app-header-logo {
  height: 1.75rem;
  width: auto;
  display: block;
}

/* The margin keeps the logo's clear space. --app-header-border is a 12% hairline and would
   vanish here, hence the text color at reduced opacity. */
.app-header-divider {
  align-self: stretch;
  width: 1px;
  margin: 0.25rem 0.75rem;
  background: currentColor;
  opacity: 0.4;
}

/* --app-header-fg is a light color on dark headers and `inherit` on light ones. */
.app-header :deep(.p-button.p-button-secondary.p-button-text) {
  color: var(--app-header-fg, inherit);
}

.app-header :deep(.p-button.p-button-secondary.p-button-text:hover),
.app-header :deep(.p-button.p-button-secondary.p-button-text:focus-visible) {
  background: color-mix(in srgb, var(--app-header-fg, currentColor) 10%, transparent);
}

.app-header-title {
  font-size: 1.25rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--app-header-fg);
}

.header-sep {
  width: 1px;
  height: 1.25rem;
  background: var(--app-header-border);
  margin: 0 0.25rem;
  flex-shrink: 0;
}
</style>
