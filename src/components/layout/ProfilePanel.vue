<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Popover from 'primevue/popover'
import ToggleSwitch from 'primevue/toggleswitch'
import AppLink from '@/components/common/AppLink.vue'
import { preferencesTarget } from '@/utils/routeTargets'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/composables/useTheme'

const authStore = useAuthStore()
const { isDark, setTheme, colorTheme, setColorTheme, THEMES, THEME_PICKER_ENABLED } = useTheme()
const router = useRouter()

const pop = ref(null)

function toggle(event) {
  pop.value.toggle(event)
}

defineExpose({ toggle })

// The session carries no display name, only `username`.
const username = computed(() => authStore.user?.username ?? '')

const avatarInitial = computed(() => username.value.charAt(0).toUpperCase() || '?')

function signOut() {
  pop.value?.hide()
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <Popover ref="pop" class="profile-popover">
    <div class="profile-content">
      <div class="profile-user">
        <div class="profile-avatar">{{ avatarInitial }}</div>
        <div class="profile-user-info">
          <div class="profile-user-name">{{ username }}</div>
        </div>
      </div>

      <div class="profile-divider" />

      <div class="profile-section">
        <div class="profile-section-label">Appearance</div>

        <label class="profile-row profile-row--control" for="profile-dark-mode">
          <span class="profile-row-label">Dark mode</span>
          <ToggleSwitch
            input-id="profile-dark-mode"
            :model-value="isDark"
            @update:model-value="(v) => setTheme(v ? 'dark' : 'light')"
          />
        </label>

        <div v-if="THEME_PICKER_ENABLED" class="theme-swatches">
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

      <div class="profile-divider" />

      <div class="profile-actions">
        <AppLink :to="preferencesTarget()" class="profile-row" @activate="pop?.hide()">
          <i class="pi pi-sliders-h profile-row-icon" />
          <span class="profile-row-label">Preferences</span>
          <i class="pi pi-angle-right profile-row-chevron" />
        </AppLink>
        <button type="button" class="profile-row" @click="signOut">
          <i class="pi pi-sign-out profile-row-icon" />
          <span class="profile-row-label">Sign out</span>
        </button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
/* Dividers and rows bleed past the 0.75rem popover padding with a negative inline margin. */
.profile-popover {
  width: 288px;
}

.profile-content {
  display: flex;
  flex-direction: column;
}

.profile-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0 1rem;
}

.profile-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 600;
  flex-shrink: 0;
}

.profile-user-name {
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.profile-divider {
  height: 1px;
  background: var(--p-content-border-color);
  margin-inline: -0.75rem;
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.875rem 0;
}

.profile-section-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding-bottom: 0.125rem;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  /* No width: 100% would leave the hover band short by the popover's right padding. */
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  margin-inline: -0.75rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--p-text-color);
  font-family: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.1s;
}

.profile-row:hover {
  background: var(--p-content-hover-background);
}

.profile-row:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.profile-row-label {
  font-size: 0.875rem;
  font-weight: 500;
}

.profile-row--control .profile-row-label {
  flex: 1;
}

.profile-row-icon {
  font-size: 0.875rem;
  width: 1rem;
  text-align: center;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.profile-row-chevron {
  margin-inline-start: auto;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.theme-swatches {
  display: flex;
  gap: 0.625rem;
  padding: 0.25rem 0;
}

.theme-swatch {
  width: 1.75rem;
  height: 1.75rem;
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

/* The ring needs a plain color: a swatch may be a gradient (a split swatch), which
   box-shadow rejects, dropping the ring. */
.theme-swatch.is-active {
  box-shadow:
    0 0 0 2px var(--p-content-background),
    0 0 0 4px var(--swatch-ring);
}

.profile-actions {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0 0.25rem;
}
</style>
