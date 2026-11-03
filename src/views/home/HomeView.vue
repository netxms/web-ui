<script setup>
import { computed, defineAsyncComponent } from 'vue'
import WelcomeHeader from '@/components/home/WelcomeHeader.vue'
import OnboardingSection from '@/components/home/OnboardingSection.vue'
import QuickActionsGrid from '@/components/home/QuickActionsGrid.vue'
import SystemHealthCard from '@/components/home/SystemHealthCard.vue'
import RecentEventsList from '@/components/home/RecentEventsList.vue'
import { WHATS_NEW_ENABLED } from '@/config/whatsNew'
import { useClientConfigurationHints } from '@/queries/useServerQueries'
import { brand } from '@/brands'

// Async so the curated entries stay out of the chunk for builds that switch the section off.
const ChangelogPanel = defineAsyncComponent(() => import('@/components/home/ChangelogPanel.vue'))

/**
 * Shown only when the brand presents release news, the build enables it, and the server's
 * `EnableWelcomePage` hint (shared with the legacy console) is on. Held back until the hint
 * resolves: rendering first and retracting is worse than a beat of delay.
 */
const { hintAsBoolean, isLoading: hintsLoading } = useClientConfigurationHints()

const showChangelog = computed(
  () =>
    brand.whatsNew &&
    WHATS_NEW_ENABLED &&
    !hintsLoading.value &&
    hintAsBoolean('EnableWelcomePage', true),
)
</script>

<template>
  <div class="home-view">
    <WelcomeHeader />

    <OnboardingSection class="home-section" />

    <QuickActionsGrid class="home-section" />

    <div class="home-content-grid home-section" :class="{ 'no-changelog': !showChangelog }">
      <SystemHealthCard />
      <ChangelogPanel v-if="showChangelog" />
    </div>

    <RecentEventsList class="home-section" />
  </div>
</template>

<style scoped>
.home-view {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem 3rem;
}

.home-section {
  margin-bottom: 1.5rem;
}

.home-content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

/* Without the changelog the health card would sit in a half-width column. */
.home-content-grid.no-changelog {
  grid-template-columns: 1fr;
}

.home-skeleton-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 2rem;
}

.home-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

@media (max-width: 900px) {
  .home-content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .home-view {
    padding: 0 1rem 2rem;
  }
}
</style>
