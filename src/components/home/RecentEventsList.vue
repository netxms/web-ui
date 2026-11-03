<script setup>
import { computed } from 'vue'
import Card from 'primevue/card'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import { useRecentEvents } from '@/queries/useLogQueries'
import { getSeverityDisplay } from '@/utils/logColumnTypes'
import { logTarget, objectTarget } from '@/utils/routeTargets'
import { formatAgeCompact } from '@/utils/timeFormat'

const VISIBLE_COUNT = 8

const { data: recentEvents, error, refetch } = useRecentEvents(VISIBLE_COUNT)

const { navBindings } = useNavTarget()

const events = computed(() =>
  (recentEvents.value ?? []).map((event) => ({
    ...event,
    relativeTime: formatAgeCompact(event.timestamp),
    severityInfo: getSeverityDisplay(event.severity),
  })),
)

/** A row opens its source object; rows with no readable source open the event log. */
function targetFor(event) {
  return event.sourceObject ? objectTarget(event.sourceObject, 'alarms') : logTarget('EventLog')
}
</script>

<template>
  <Card class="events-card">
    <template #title>
      <div class="events-card-title">
        <i class="pi pi-history events-card-icon" />
        Recent Events
      </div>
    </template>
    <template #content>
      <!-- `queryLog` suppresses the global forbidden redirect, so this card shows the restricted
           state; QueryErrorState turns a 403 into RestrictedState. -->
      <QueryErrorState v-if="error" :error="error" right="viewEventLog" @retry="refetch" />

      <div v-else-if="events.length === 0" class="events-empty">
        <i class="pi pi-inbox events-empty-icon" />
        <p>No recent events</p>
      </div>

      <div v-else class="events-list">
        <div
          v-for="event in events"
          :key="event.id"
          class="event-row"
          v-bind="navBindings(targetFor(event), () => $router.push(targetFor(event)))"
        >
          <span class="event-severity" :title="event.severityInfo.label">
            <StatusIcon :status="event.severityInfo.key" />
            {{ event.severityInfo.label }}
          </span>
          <div class="event-details">
            <span class="event-source">{{ event.sourceObjectName }}</span>
            <span class="event-message">{{ event.message }}</span>
          </div>
          <span class="event-time">{{ event.relativeTime }}</span>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.events-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
}

.events-card-icon {
  color: var(--p-primary-color);
}

.events-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--p-text-muted-color);
}

.events-empty-icon {
  font-size: 2rem;
}

.events-list {
  display: flex;
  flex-direction: column;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm);
  cursor: pointer;
}

.event-row:hover {
  background: var(--p-surface-100);
}

html.app-dark .event-row:hover {
  background: var(--p-surface-800);
}

.event-row:last-child {
  border-bottom: none;
}

.event-severity {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 80px;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.event-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.event-source {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.event-message {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}
</style>
