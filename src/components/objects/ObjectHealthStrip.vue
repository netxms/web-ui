<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import { useAlarms } from '@/queries/useAlarmQueries'
import {
  getStatusInfo,
  getReachabilityChips,
  getActiveProblemChips,
  getUptimeInfo,
  getPollSummary,
} from '@/utils/objectUtils'
import { formatAgeCompact, formatDurationCompact, formatDateTime } from '@/utils/timeFormat'
import { NO_STATUS_EXPLANATION_CLASSES } from '@/actions/objectActions'
import { objectTarget, perspectiveForClass } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'

// The Templates perspective has no alarms view.
const NO_ALARM_VIEW_PERSPECTIVES = new Set(['templates'])

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const router = useRouter()
const { navBindings } = useNavTarget()

// Ticks so relative ages keep counting between refetches.
const now = ref(Date.now())
let ticker = null
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onUnmounted(() => clearInterval(ticker))

const objectId = computed(() => props.object?.id)
const statusInfo = computed(() => getStatusInfo(props.object?.status))
const isInMaintenance = computed(() => props.object?.isInMaintenanceMode ?? false)

const canExplainStatus = computed(
  () => !NO_STATUS_EXPLANATION_CLASSES.includes(props.object?.class),
)

const reachabilityChips = computed(() => getReachabilityChips(props.object))
const problemChips = computed(() => getActiveProblemChips(props.object))
const hasChips = computed(() => reachabilityChips.value.length > 0 || problemChips.value.length > 0)

const uptime = computed(() => getUptimeInfo(props.object, now.value))
const uptimeText = computed(() =>
  uptime.value.seconds === null ? '' : formatDurationCompact(uptime.value.seconds),
)
const uptimeTooltip = computed(() => {
  const stamp = formatDateTime(uptime.value.timestamp)
  if (!stamp) return ''
  return uptime.value.mode === 'down' ? `Down since ${stamp}` : `Booted ${stamp}`
})

const pollSummary = computed(() => getPollSummary(props.object))
const statusPollAge = computed(() => {
  const last = pollSummary.value?.status?.lastCompleted
  return last ? formatAgeCompact(last, now.value) : ''
})
const pollTooltip = computed(() => {
  const stamp = formatDateTime(pollSummary.value?.status?.lastCompleted)
  return stamp ? `Last status poll: ${stamp}` : ''
})

const showAlarms = computed(
  () => !NO_ALARM_VIEW_PERSPECTIVES.has(perspectiveForClass(props.object?.class)),
)

const alarmParams = computed(() => ({ rootObject: objectId.value, state: 0 }))
const { data: alarms } = useAlarms(alarmParams, { enabled: showAlarms })
const alarmList = computed(() => alarms.value ?? [])

// Worst first. Normal-severity alarms carry no dot.
const alarmSeverities = computed(() => {
  const counts = new Map()
  for (const alarm of alarmList.value) {
    const severity = typeof alarm.severity === 'number' ? alarm.severity : 0
    counts.set(severity, (counts.get(severity) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([severity, count]) => ({ severity, count, ...getStatusInfo(severity) }))
})

const alarmTooltip = computed(() =>
  alarmSeverities.value.map((s) => `${s.label}: ${s.count}`).join('\n'),
)

const alarmsTarget = computed(() => objectTarget(props.object, 'alarms'))

function goToAlarms() {
  router.push(alarmsTarget.value)
}

function explainStatus() {
  if (!canExplainStatus.value) return
  document.dispatchEvent(
    new CustomEvent('object:explainStatus', { detail: { object: props.object } }),
  )
}
</script>

<template>
  <div class="health-strip">
    <component
      :is="canExplainStatus ? 'button' : 'div'"
      class="strip-segment strip-status"
      :class="{ 'strip-segment--interactive': canExplainStatus }"
      :type="canExplainStatus ? 'button' : undefined"
      v-tooltip.bottom="canExplainStatus ? 'Explain status' : ''"
      @click="explainStatus"
    >
      <span class="status-dot" :style="{ background: statusInfo.color }" />
      <span class="status-label" :style="{ color: statusInfo.textColor }">{{
        statusInfo.label
      }}</span>
      <i v-if="canExplainStatus" class="pi pi-question-circle strip-hint" />
    </component>

    <div v-if="isInMaintenance" class="strip-segment">
      <Tag value="In Maintenance" severity="warn" icon="pi pi-wrench" />
    </div>

    <div v-if="uptime.mode" v-tooltip.bottom="uptimeTooltip" class="strip-segment">
      <span class="strip-label">{{ uptime.mode === 'up' ? 'Uptime' : 'Down' }}</span>
      <span class="strip-value" :class="{ 'strip-value--danger': uptime.mode === 'down' }">
        {{ uptimeText }}
      </span>
    </div>

    <div v-if="hasChips" class="strip-segment strip-chips">
      <span
        v-for="chip in reachabilityChips"
        :key="chip.key"
        class="chip"
        :class="chip.ok ? 'chip--ok' : 'chip--down'"
      >
        <i :class="chip.ok ? 'pi pi-check' : 'pi pi-times'" />
        {{ chip.label }}
      </span>
      <span v-for="chip in problemChips" :key="chip.key" class="chip chip--down">
        <i class="pi pi-exclamation-triangle" />
        {{ chip.label }}
      </span>
    </div>

    <div v-if="statusPollAge" v-tooltip.bottom="pollTooltip" class="strip-segment">
      <span class="strip-label">Polled</span>
      <span class="strip-value">{{ statusPollAge }}</span>
    </div>

    <button
      v-if="showAlarms"
      v-tooltip.bottom="{ value: alarmTooltip, class: 'strip-tooltip' }"
      type="button"
      class="strip-segment strip-segment--interactive strip-alarms"
      v-bind="navBindings(alarmsTarget, goToAlarms)"
    >
      <span class="strip-label">Alarms</span>
      <span class="strip-value" :class="{ 'strip-value--alert': alarmList.length > 0 }">
        {{ alarmList.length }}
      </span>
      <span v-if="alarmSeverities.length" class="alarm-dots">
        <span
          v-for="s in alarmSeverities"
          :key="s.severity"
          class="status-dot status-dot--small"
          :style="{ background: s.color }"
        />
      </span>
      <i class="pi pi-angle-right strip-hint" />
    </button>
  </div>
</template>

<style scoped>
.health-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* Space, not rules: a rule on a wrapped segment would hang off its left edge. */
  gap: 0.25rem 1.5rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-content-border-radius, 6px);
  background: var(--p-content-background);
}

.strip-segment {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  min-height: 2rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.strip-segment--interactive {
  cursor: pointer;
}

.strip-segment--interactive:hover {
  background: var(--p-surface-100);
}

html.app-dark .strip-segment--interactive:hover {
  background: var(--p-surface-800);
}

.strip-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.strip-value {
  font-size: 0.875rem;
  font-weight: 600;
}

.strip-value--danger {
  color: var(--p-red-500);
}

.strip-value--alert {
  color: var(--p-orange-500);
}

.strip-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.status-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--small {
  width: 0.5rem;
  height: 0.5rem;
}

.status-label {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.strip-chips {
  flex-wrap: wrap;
  gap: 0.375rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.chip i {
  font-size: 0.625rem;
}

.chip--ok {
  background: var(--p-green-100);
  color: var(--p-green-700);
}

.chip--down {
  background: var(--p-red-100);
  color: var(--p-red-700);
}

html.app-dark .chip--ok {
  background: var(--p-green-900);
  color: var(--p-green-200);
}

html.app-dark .chip--down {
  background: var(--p-red-900);
  color: var(--p-red-200);
}

.alarm-dots {
  display: inline-flex;
  gap: 0.1875rem;
}
</style>

<!-- Tooltips are teleported, so their styling cannot be scoped. -->
<style>
.strip-tooltip .p-tooltip-text {
  white-space: pre-line;
}
</style>
