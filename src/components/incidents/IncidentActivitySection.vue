<script setup>
import { computed } from 'vue'
import Skeleton from 'primevue/skeleton'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useIncidentActivity } from '@/queries/useIncidentQueries'
import { useUsers } from '@/queries/useUserQueries'
import { describeIncidentActivity, getIncidentActivity } from '@/utils/incidentDisplay'
import { formatDateTimeMedium } from '@/utils/timeFormat'

// The server's incident activity log (CMD_GET_INCIDENT_ACTIVITY), newest first.
const props = defineProps({
  incidentId: { type: Number, required: true },
})

const { data, isLoading, isError, error, refetch } = useIncidentActivity(() => props.incidentId)

const entries = computed(() => data.value ?? [])

// Assignment entries carry raw user ids; without "manage users" the user list 403s and the
// entries show bare ids.
const { data: users } = useUsers()

const userNames = computed(() => new Map((users.value ?? []).map((user) => [user.id, user.name])))

function resolveUserName(id) {
  return userNames.value.get(id)
}

function formatDate(value) {
  return formatDateTimeMedium(value, { fallback: '' })
}

function describe(entry) {
  return describeIncidentActivity(entry, resolveUserName)
}
</script>

<template>
  <div class="activity-section">
    <div v-if="isLoading" class="activity-loading">
      <Skeleton height="2.5rem" />
      <Skeleton height="2.5rem" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      message="Failed to load activity"
      @retry="refetch"
    />

    <p v-else-if="entries.length === 0" class="activity-empty">No activity recorded</p>

    <ul v-else class="activity-list">
      <li v-for="entry in entries" :key="entry.id" class="activity-item">
        <i :class="getIncidentActivity(entry).icon" class="activity-icon" />
        <div class="activity-body">
          <div class="activity-head">
            <span class="activity-label">{{ getIncidentActivity(entry).label }}</span>
            <span class="activity-time">{{ formatDate(entry.timestamp) }}</span>
          </div>
          <p v-if="describe(entry)" class="activity-detail">{{ describe(entry) }}</p>
          <span class="activity-user">
            {{ entry.userName || (entry.userId ? `[${entry.userId}]` : 'system') }}
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.activity-section {
  min-width: 0;
}

.activity-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.activity-item {
  display: flex;
  gap: 0.625rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-icon {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  margin-top: 0.15rem;
}

.activity-body {
  flex: 1;
  min-width: 0;
}

.activity-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.activity-label {
  font-size: 0.8125rem;
  font-weight: 600;
}

.activity-time {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.activity-detail {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  word-break: break-word;
}

.activity-user {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
