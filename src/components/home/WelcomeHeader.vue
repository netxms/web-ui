<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useTimeGreeting } from '@/composables/useTimeGreeting'

const authStore = useAuthStore()
const { greeting } = useTimeGreeting()

// The full name comes with the session, so every account has it, not only those that may read
// the user record. Empty when unset; the login name stands in.
const displayName = computed(
  () => authStore.user?.fullName?.trim() || authStore.user?.username || 'User',
)
</script>

<template>
  <div class="welcome-header">
    <h1 class="welcome-greeting">
      {{ greeting }}, <span class="welcome-name">{{ displayName }}</span>
    </h1>
    <p class="welcome-subtitle">Here's what's happening across your infrastructure</p>
  </div>
</template>

<style scoped>
.welcome-header {
  padding: 2.5rem 0 1rem;
}

.welcome-greeting {
  margin: 0;
  font-size: 2rem;
  font-weight: 300;
  color: var(--p-text-color);
  letter-spacing: -0.02em;
}

.welcome-name {
  font-weight: 600;
  color: var(--p-primary-color);
}

.welcome-subtitle {
  margin: 0.5rem 0 0;
  font-size: 1rem;
  color: var(--p-text-muted-color);
}
</style>
