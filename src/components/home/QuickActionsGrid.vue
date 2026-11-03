<script setup>
import { computed } from 'vue'
import QuickActionCard from './QuickActionCard.vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import {
  alarmTarget,
  dashboardTarget,
  logTarget,
  mapTarget,
  configTarget,
  perspectiveTarget,
} from '@/utils/routeTargets'

const { data: alarms } = useAlarms()

const totalAlarms = computed(() => (alarms.value ?? []).length)

const actions = computed(() => [
  {
    title: 'Infrastructure',
    icon: 'pi pi-sitemap',
    target: perspectiveTarget('infrastructure'),
    color: 'blue',
  },
  {
    title: 'Alarms',
    icon: 'pi pi-bell',
    target: alarmTarget(),
    color: 'red',
    badge: totalAlarms.value,
  },
  {
    title: 'Dashboards',
    icon: 'pi pi-objects-column',
    target: dashboardTarget(),
    color: 'green',
  },
  {
    title: 'Network Maps',
    icon: 'pi pi-map',
    target: mapTarget(),
    color: 'purple',
  },
  {
    title: 'Logs',
    icon: 'pi pi-list',
    target: logTarget(),
    color: 'orange',
  },
  {
    title: 'Configuration',
    icon: 'pi pi-cog',
    target: configTarget('users-groups'),
    color: 'slate',
  },
])
</script>

<template>
  <section class="quick-actions-section">
    <h2 class="section-title">Quick Actions</h2>
    <div class="quick-actions-grid">
      <QuickActionCard
        v-for="action in actions"
        :key="action.title"
        :title="action.title"
        :icon="action.icon"
        :target="action.target"
        :color="action.color"
        :badge="action.badge || 0"
      />
    </div>
  </section>
</template>

<style scoped>
.section-title {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.75rem;
}

@media (max-width: 1100px) {
  .quick-actions-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 600px) {
  .quick-actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
