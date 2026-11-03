<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useTheme } from '@/composables/useTheme'
import {
  useAlarmNotifications,
  MIN_SEVERITY_OPTIONS,
  NOTIFY_POSITIONS,
} from '@/composables/useAlarmNotifications'
import { ALARM_TOAST_GROUP } from '@/composables/useAlarmFeed'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useObjectIconStore } from '@/stores/objectIconStore'

const { isDark, setTheme, colorTheme, setColorTheme, THEMES, THEME_PICKER_ENABLED } = useTheme()
const { minSeverity, position, enabled, setMinSeverity, setPosition } = useAlarmNotifications()
const onboarding = useOnboardingStore()
const objectIcons = useObjectIconStore()
const router = useRouter()
const toast = useToast()

/** Only sections that are complete appear; no under-construction placeholders. */
const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'pi pi-palette' },
  { id: 'notifications', label: 'Notifications', icon: 'pi pi-bell' },
  { id: 'getting-started', label: 'Getting started', icon: 'pi pi-compass' },
]

const active = ref(SECTIONS[0].id)

/** A direct visit has no entry of ours to return to, so it falls back to the home page. */
function close() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'home' })
}

/** The setting is otherwise invisible until an alarm happens to fire. */
function testNotification() {
  toast.add({
    group: ALARM_TOAST_GROUP,
    severity: 'error',
    summary: 'sample-node',
    detail: 'This is what a new alarm notification looks like.',
    life: 6000,
    alarmSeverity: 'critical',
  })
}

function setOnboardingVisible(visible) {
  if (visible) onboarding.unhide()
  else onboarding.hide()
}

/** Steps backed by a server signal re-resolve as done immediately. */
function restartSetup() {
  onboarding.reset()
  router.push({ name: 'home' })
  toast.add({
    severity: 'success',
    summary: 'System setup restarted',
    detail: 'The setup panel is back on your home page.',
    life: 4000,
  })
}
</script>

<template>
  <div class="preferences-view">
    <header class="preferences-header">
      <h1 class="preferences-title">Preferences</h1>
      <Button
        v-tooltip.bottom="'Close'"
        icon="pi pi-times"
        text
        rounded
        severity="secondary"
        aria-label="Close preferences"
        @click="close"
      />
    </header>

    <div class="preferences-body">
      <nav class="preferences-rail" aria-label="Preference sections">
        <button
          v-for="section in SECTIONS"
          :key="section.id"
          class="rail-item"
          :class="{ 'is-active': active === section.id }"
          :aria-current="active === section.id ? 'true' : undefined"
          @click="active = section.id"
        >
          <i :class="section.icon" />
          {{ section.label }}
        </button>
      </nav>

      <section v-if="active === 'appearance'" class="preferences-panel">
        <h2 class="panel-title">Appearance</h2>

        <div class="pref-row">
          <div class="pref-label">
            <span>Dark mode</span>
            <span class="pref-hint">Use the dark color scheme.</span>
          </div>
          <ToggleSwitch
            :model-value="isDark"
            aria-label="Dark mode"
            @update:model-value="(v) => setTheme(v ? 'dark' : 'light')"
          />
        </div>

        <div v-if="THEME_PICKER_ENABLED" class="pref-row pref-row--stacked">
          <div class="pref-label">
            <span>Color theme</span>
            <span class="pref-hint">Accent color used across the console.</span>
          </div>
          <div class="theme-swatches">
            <button
              v-for="t in THEMES"
              :key="t.id"
              class="theme-swatch"
              :class="{ 'is-active': colorTheme === t.id }"
              :style="{ '--swatch-color': t.swatch, '--swatch-ring': t.palette[500] }"
              :aria-label="t.label"
              :title="t.label"
              @click="setColorTheme(t.id)"
            >
              <i v-if="colorTheme === t.id" class="pi pi-check" />
            </button>
          </div>
        </div>

        <div class="pref-row">
          <div class="pref-label">
            <span>Custom object icons</span>
            <span class="pref-hint">
              Show the images administrators set for objects and object categories in the object
              tree, lists and network maps. Off shows the standard icons everywhere.
            </span>
          </div>
          <ToggleSwitch
            :model-value="objectIcons.showCustom"
            aria-label="Custom object icons"
            @update:model-value="objectIcons.setShowCustom"
          />
        </div>
      </section>

      <section v-if="active === 'notifications'" class="preferences-panel">
        <h2 class="panel-title">Notifications</h2>

        <div class="pref-row">
          <div class="pref-label">
            <span>Show notifications for new alarms</span>
            <span class="pref-hint">
              A pop-up appears when an alarm of this severity or higher is raised.
            </span>
          </div>
          <Select
            :model-value="minSeverity"
            :options="MIN_SEVERITY_OPTIONS"
            option-label="label"
            option-value="value"
            class="pref-select"
            aria-label="Minimum alarm severity for notifications"
            @update:model-value="setMinSeverity"
          />
        </div>

        <div class="pref-row">
          <div class="pref-label">
            <span>Position</span>
            <span class="pref-hint">Corner of the screen the notifications appear in.</span>
          </div>
          <Select
            :model-value="position"
            :options="NOTIFY_POSITIONS"
            option-label="label"
            option-value="value"
            :disabled="!enabled"
            class="pref-select"
            aria-label="Notification position"
            @update:model-value="setPosition"
          />
        </div>

        <div class="pref-row">
          <div class="pref-label">
            <span>Preview</span>
            <span class="pref-hint">Show a sample notification in the current position.</span>
          </div>
          <Button
            label="Show sample"
            icon="pi pi-bell"
            outlined
            size="small"
            :disabled="!enabled"
            @click="testNotification"
          />
        </div>
      </section>

      <section v-if="active === 'getting-started'" class="preferences-panel">
        <h2 class="panel-title">Getting started</h2>

        <div class="pref-row">
          <div class="pref-label">
            <span>Show system setup on home</span>
            <span class="pref-hint">
              The setup panel appears on a new install until every step is done.
            </span>
          </div>
          <ToggleSwitch
            :model-value="!onboarding.hidden"
            aria-label="Show system setup on home"
            @update:model-value="setOnboardingVisible"
          />
        </div>

        <div class="pref-row">
          <div class="pref-label">
            <span>Restart system setup</span>
            <span class="pref-hint">
              Clear recorded progress. Steps the server can verify stay done.
            </span>
          </div>
          <Button
            label="Restart"
            icon="pi pi-refresh"
            outlined
            size="small"
            @click="restartSetup"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.preferences-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 2rem 3rem;
}

.preferences-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1rem;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.preferences-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}

.preferences-body {
  display: grid;
  grid-template-columns: 210px 1fr;
  gap: 1.5rem;
  align-items: start;
}

.preferences-rail {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  padding: 0.5rem;
}

/* Weight is constant across states: bolding the active item re-flowed the label. */
.rail-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
  transition: background 0.1s;
}

.rail-item:hover {
  background: var(--p-content-hover-background);
}

.rail-item.is-active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.rail-item:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.preferences-panel {
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--p-content-border-color);
}

.pref-row:last-child {
  border-bottom: none;
  padding-bottom: 0.25rem;
}

.pref-row--stacked {
  align-items: flex-start;
}

.pref-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.pref-hint {
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

/* Underlined rather than boxed; fixed width so the selects line up down one right edge. */
.pref-select {
  width: 210px;
  flex-shrink: 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--p-content-border-color);
  border-radius: 0;
  box-shadow: none;
  transition: border-color 0.15s;
}

/* Specificity has to clear PrimeVue's `.p-select:not(.p-disabled):hover` and `.p-focus`. */
.pref-select.p-select:not(.p-disabled):hover {
  border-color: transparent;
  border-bottom-color: var(--p-text-color);
}

.pref-select.p-select:not(.p-disabled).p-focus {
  border-color: transparent;
  border-bottom-color: var(--p-primary-color);
  box-shadow: none;
  outline: 0;
}

.pref-select :deep(.p-select-label) {
  padding-inline: 0;
}

.pref-select :deep(.p-select-dropdown) {
  width: auto;
  color: var(--p-text-muted-color);
}

.theme-swatches {
  display: flex;
  gap: 0.625rem;
  flex-shrink: 0;
}

.theme-swatch {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  background: var(--swatch-color);
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.5625rem;
  padding: 0;
  transition: transform 0.15s;
}

.theme-swatch:hover {
  transform: scale(1.15);
}

.theme-swatch:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

/* A swatch may be a gradient, which box-shadow rejects, so the ring needs a plain color. */
.theme-swatch.is-active {
  box-shadow:
    0 0 0 2px var(--p-content-background),
    0 0 0 4px var(--swatch-ring);
}

@media (max-width: 700px) {
  .preferences-body {
    grid-template-columns: 1fr;
  }

  .preferences-rail {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .preferences-view {
    padding: 1.5rem 1rem 2rem;
  }

  .preferences-panel {
    padding: 1rem;
  }
}
</style>
