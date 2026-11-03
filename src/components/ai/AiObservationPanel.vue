<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import AiObservationStateLabel from '@/components/ai/AiObservationStateLabel.vue'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import AppLink from '@/components/common/AppLink.vue'
import RecordPanel from '@/components/common/RecordPanel.vue'
import { OBSERVATION_STATES, observationReferences } from '@/utils/aiOperatorDisplay'
import { prefs } from '@/utils/appStorage'
import { objectTarget } from '@/utils/routeTargets'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

/**
 * One observation in full, plus the triage actions. The list response already carries the body
 * and references, so opening one costs no request.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  /** A row of the Observations tab: the observation plus `object`, `objectName`, `operatorName`. */
  observation: { type: Object, default: null },
  /** A state change is in flight. */
  pending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'set-state'])

const WIDTH_FIELD = 'aiObservationPanelWidth'

const width = ref(prefs.get(WIDTH_FIELD, 560))
watch(width, (px) => prefs.set(WIDTH_FIELD, px))

const references = computed(() => observationReferences(props.observation))

const actions = computed(() =>
  OBSERVATION_STATES.filter((state) => state.value !== props.observation?.state),
)
</script>

<template>
  <RecordPanel
    v-model:width="width"
    :visible="visible"
    title="Observation"
    icon="pi pi-eye"
    resize-label="Resize observation panel"
    @update:visible="emit('update:visible', $event)"
  >
    <template v-if="observation">
      <h3 class="observation-title">{{ observation.title || 'Untitled observation' }}</h3>

      <dl class="record-list">
        <div class="record-row">
          <dt class="record-label">Severity</dt>
          <dd class="record-value">
            <AlarmIconLabel type="severity" :value="observation.severity" />
          </dd>
        </div>
        <div class="record-row">
          <dt class="record-label">Time</dt>
          <dd class="record-value">
            {{ formatDateTime(observation.timestamp) }}
            <span class="observation-age">{{ formatAgeCompact(observation.timestamp) }}</span>
          </dd>
        </div>
        <div class="record-row">
          <dt class="record-label">State</dt>
          <dd class="record-value">
            <AiObservationStateLabel :state="observation.state" />
          </dd>
        </div>
        <div class="record-row">
          <dt class="record-label">Operator</dt>
          <dd class="record-value">{{ observation.operatorName }}</dd>
        </div>
        <div class="record-row">
          <dt class="record-label">Object</dt>
          <dd class="record-value">
            <AppLink
              v-if="observation.object"
              :to="objectTarget(observation.object)"
              class="object-link"
            >
              {{ observation.objectName }}
            </AppLink>
            <!-- objectId 0 means the observation is about the server, not one object. -->
            <template v-else>{{ observation.objectName || 'Server' }}</template>
          </dd>
        </div>
      </dl>

      <section v-if="observation.body" class="observation-section">
        <h4 class="record-label">Detail</h4>
        <p class="observation-body">{{ observation.body }}</p>
      </section>

      <section v-if="references.length" class="observation-section">
        <h4 class="record-label">References</h4>
        <p class="observation-hint">
          As the operator recorded them: alarm IDs, event IDs, metric names and similar.
        </p>
        <ul class="observation-references">
          <li v-for="(reference, index) in references" :key="index">{{ reference }}</li>
        </ul>
      </section>
    </template>

    <template v-if="observation" #footer>
      <Button
        v-for="action in actions"
        :key="action.value"
        :label="action.action"
        :disabled="pending"
        severity="secondary"
        size="small"
        @click="emit('set-state', action.value)"
      />
    </template>
  </RecordPanel>
</template>

<style scoped>
.observation-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

/* `a.` to outrank AppLink's inherited color, whichever stylesheet loads first. */
a.object-link {
  color: var(--p-primary-color);
}

a.object-link:hover {
  text-decoration: underline;
}

.observation-age {
  margin-left: 0.375rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.observation-section {
  margin-top: 1.25rem;
}

.observation-section h4 {
  margin: 0 0 0.5rem;
}

.observation-body {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.observation-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.observation-references {
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono, monospace);
  font-size: 0.8125rem;
  line-height: 1.6;
  word-break: break-word;
}
</style>
