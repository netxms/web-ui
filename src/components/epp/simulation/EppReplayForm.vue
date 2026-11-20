<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import FormField from '@/components/common/FormField.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { useLogRecord, useRecentEvents } from '@/queries/useLogQueries'
import { traceFromProcessingMetadata } from '@/utils/eppSimulator'

// Dev only: the path a real event took, from the processing metadata the server stores with it
// when `Events.ProcessingMetadata` is on.
defineOptions({ name: 'EppReplayForm' })

const props = defineProps({
  chains: { type: Array, default: () => [] },
})

const emit = defineEmits(['replay', 'clear'])

const typedId = ref(null)
const eventId = ref(null)

const { data: recentEvents, isError: recentFailed } = useRecentEvents(12)
const { data: record, isLoading, error, refetch } = useLogRecord('EventLog', eventId)

function load(id) {
  typedId.value = id
  eventId.value = id
}

/** `raw_data` arrives parsed; a value the server could not parse comes back as text. */
const rawData = computed(() => {
  const raw = record.value?.raw_data
  if (typeof raw !== 'string') return raw ?? null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
})

const metadata = computed(() => rawData.value?.processingMetadata ?? null)

watch(
  [metadata, () => props.chains],
  ([value]) => {
    if (Array.isArray(value)) emit('replay', traceFromProcessingMetadata(value, props.chains))
    else emit('clear')
  },
  { immediate: true },
)

function formatTime(seconds) {
  return seconds ? new Date(seconds * 1000).toLocaleString() : ''
}
</script>

<template>
  <div class="replay">
    <p class="replay-hint">
      Shows the rules a real event matched and what each one did, as the server recorded it.
    </p>

    <FormField v-slot="{ id }" label="Event ID">
      <div class="replay-row">
        <!-- `input` as well: the model alone commits only on blur, leaving Load disabled. -->
        <InputNumber
          v-model="typedId"
          :input-id="id"
          :use-grouping="false"
          :min="1"
          size="small"
          @input="typedId = $event.value"
          @keydown.enter="load(typedId)"
        />
        <Button label="Load" size="small" :disabled="!typedId" @click="load(typedId)" />
      </div>
    </FormField>

    <div v-if="recentEvents?.length && !recentFailed" class="replay-recent">
      <span class="replay-recent__title">Recent events</span>
      <ul class="replay-recent__list">
        <li v-for="event in recentEvents" :key="event.id">
          <button
            type="button"
            class="replay-recent__item"
            :class="{ 'replay-recent__item--active': event.id === eventId }"
            @click="load(event.id)"
          >
            <StatusIcon :status="event.severity" size="0.8rem" />
            <span class="replay-recent__message">{{ event.message }}</span>
            <span class="replay-recent__source">{{ event.sourceObjectName }}</span>
          </button>
        </li>
      </ul>
    </div>

    <LoadingState v-if="eventId && isLoading" />
    <QueryErrorState v-else-if="error" :error="error" @retry="refetch" />
    <template v-else-if="record">
      <div class="replay-event">
        <StatusIcon :status="record.event_severity" size="0.9rem" />
        <span class="replay-event__message">{{ record.event_message }}</span>
        <span class="replay-event__time">{{ formatTime(record.event_timestamp) }}</span>
      </div>
      <Message v-if="!metadata" severity="info" :closable="false" size="small">
        No processing record for this event. The server keeps one only while the server variable
        Events.ProcessingMetadata is on.
      </Message>
    </template>
  </div>
</template>

<style scoped>
.replay {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.replay-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.replay-row {
  display: flex;
  gap: 0.5rem;
}

.replay-recent {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.replay-recent__title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.replay-recent__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
}

.replay-recent__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.replay-recent__item:hover {
  background: var(--p-content-hover-background);
}

.replay-recent__item--active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.replay-recent__message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replay-recent__source {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.replay-event {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.replay-event__message {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.replay-event__time {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
</style>
