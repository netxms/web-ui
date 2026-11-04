<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import Skeleton from 'primevue/skeleton'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import DciHistoryChart from '@/components/objects/DciHistoryChart.vue'
import DciStringHistory from '@/components/objects/DciStringHistory.vue'
import ChartSkeleton from '@/components/common/ChartSkeleton.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import AlarmCommentsSection from '@/components/alarms/AlarmCommentsSection.vue'
import AlarmRelatedEventsSection from '@/components/alarms/AlarmRelatedEventsSection.vue'
import {
  useAlarm,
  useAcknowledgeAlarm,
  useResolveAlarm,
  useTerminateAlarm,
} from '@/queries/useAlarmQueries'
import { useDciValues, useDciHistory, useObject } from '@/queries/useObjectQueries'
import { useServerInfo } from '@/queries/useServerQueries'
import { useDciValueMapping } from '@/queries/useMappingTableQueries'
import { DCI_DATA_TYPES, formatDciValue } from '@/utils/dciFormat'
import {
  alarmActionAvailability,
  getState,
  normalizeSeverity,
  normalizeState,
} from '@/utils/alarmDisplay'
import { formatDateTimeMedium } from '@/utils/timeFormat'

const props = defineProps({
  alarmId: { type: Number, required: true },
  /** List row: carries display-only fields the detail endpoint omits (sourceName, ack/resolve
   * user names, commentCount, helpdeskReference). */
  row: { type: Object, default: null },
  /** In a fixed-height container (object subview), which needs its own internal scroll. */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['back'])

const router = useRouter()

const { data: alarm, isLoading } = useAlarm(() => props.alarmId)

const title = computed(() => `Alarm Details [${props.alarmId}]`)

const subtitle = computed(() => {
  if (!alarm.value) return null
  const sev = normalizeSeverity(alarm.value.severity)
  return `${sev.charAt(0).toUpperCase()}${sev.slice(1)} · ${getState(alarm.value).label}`
})

const { mutate: acknowledge, isPending: isAcknowledging } = useAcknowledgeAlarm()
const { mutate: resolve, isPending: isResolving } = useResolveAlarm()
const { mutate: terminate, isPending: isTerminating } = useTerminateAlarm()

const isMutating = computed(() => isAcknowledging.value || isResolving.value || isTerminating.value)
const currentState = computed(() => (alarm.value ? normalizeState(alarm.value.state) : null))
const { data: serverInfo } = useServerInfo()
const can = computed(() =>
  alarmActionAvailability(currentState.value, {
    strictFlow: serverInfo.value?.options?.strictAlarmStatusFlow === true,
  }),
)

// Parity with legacy: comments are read-only once the alarm is terminated.
const canEditComments = computed(() => currentState.value !== 'terminated')

function rowField(key) {
  return props.row?.[key] ?? null
}

const sourceName = computed(() => rowField('sourceName') ?? alarm.value?.source ?? '-')

const showOriginalSeverity = computed(
  () =>
    alarm.value != null &&
    alarm.value.originalSeverity != null &&
    normalizeSeverity(alarm.value.originalSeverity) !== normalizeSeverity(alarm.value.severity),
)

const categoryNames = computed(() =>
  (alarm.value?.categories ?? []).map((c) => c.name).filter(Boolean),
)

function goToSource() {
  if (alarm.value?.source) {
    router.push({ name: 'infrastructure', params: { objectId: alarm.value.source } })
  }
}

function formatDate(value) {
  return formatDateTimeMedium(value)
}

const sourceId = computed(() => alarm.value?.source ?? null)
const { data: sourceObject } = useObject(sourceId)
const dciId = computed(() => alarm.value?.dci ?? 0)
const hasDci = computed(() => !!dciId.value)

// Only the alarm's own DCI, rather than every DCI of the source object.
const dciRequest = computed(() =>
  hasDci.value && sourceId.value ? { objectId: sourceId.value, dciId: dciId.value } : null,
)
const { valueOf: dciValueOf } = useDciValues(() => [dciRequest.value])
const { data: historyData, isLoading: isDciHistoryLoading } = useDciHistory(sourceId, dciId, {
  enabled: hasDci,
})

const dciItem = computed(() => dciValueOf(dciRequest.value))

// As Last Values shows it; the tooltip names the raw value when the text differs.
const { mappedValue } = useDciValueMapping(() => (dciItem.value ? [dciItem.value] : []))
const dciValueText = computed(() => {
  const item = dciItem.value
  if (!item) return ''
  if (item.noValue || item.value === '' || item.value == null) return '-'
  return mappedValue(item) ?? formatDciValue(item)
})
const dciValueTooltip = computed(() => {
  const raw = dciItem.value?.value
  const text = dciValueText.value
  return text && text !== '-' && text !== String(raw) ? `Raw value: ${raw}` : null
})

/** String DCIs render as a value table, not a chart. */
const isStringDci = computed(() => dciItem.value?.dataType === DCI_DATA_TYPES.STRING)

const hasHistoryData = computed(() => (historyData.value?.values?.length ?? 0) > 0)
</script>

<template>
  <div class="alarm-detail-view" :class="{ embedded }">
    <EntityDetailHeader :title="title" :subtitle="subtitle" @back="emit('back')">
      <template #actions>
        <Button
          label="Acknowledge"
          icon="pi pi-check"
          size="small"
          severity="secondary"
          outlined
          :disabled="!can.acknowledge || isMutating"
          @click="acknowledge(props.alarmId)"
        />
        <Button
          label="Resolve"
          icon="pi pi-check-circle"
          size="small"
          severity="success"
          outlined
          :disabled="!can.resolve || isMutating"
          @click="resolve(props.alarmId)"
        />
        <Button
          label="Terminate"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          outlined
          :disabled="!can.terminate || isMutating"
          @click="terminate(props.alarmId)"
        />
      </template>
    </EntityDetailHeader>

    <div v-if="isLoading" class="alarm-detail-body">
      <Skeleton height="10rem" />
    </div>

    <div v-else-if="alarm" class="alarm-detail-body">
      <div class="overview-grid">
        <InfoCard title="Overview">
          <dl class="info-list">
            <div class="info-row">
              <dt>Severity</dt>
              <dd class="inline-icon">
                <AlarmIconLabel type="severity" :value="alarm.severity" />
                <span v-if="showOriginalSeverity" class="text-muted capitalize">
                  (was {{ normalizeSeverity(alarm.originalSeverity) }})
                </span>
              </dd>
            </div>
            <div class="info-row">
              <dt>State</dt>
              <dd class="inline-icon">
                <AlarmIconLabel type="state" :value="alarm.state" :sticky="alarm.isSticky" />
                <span v-if="alarm.isSticky" class="text-muted">(sticky)</span>
              </dd>
            </div>
            <div class="info-row">
              <dt>Source</dt>
              <dd>
                <Button
                  :label="String(sourceName)"
                  link
                  size="small"
                  class="source-link"
                  :disabled="!alarm.source"
                  @click="goToSource"
                >
                  <template #icon>
                    <ObjectIcon :object="sourceObject" size="1.25em" />
                  </template>
                </Button>
              </dd>
            </div>
            <div class="info-row">
              <dt>Alarm key</dt>
              <dd class="monospace">{{ alarm.key || '-' }}</dd>
            </div>
            <div class="info-row">
              <dt>Event</dt>
              <dd>
                <template v-if="alarm.eventName">{{ alarm.eventName }}</template>
                <span class="text-muted"> [{{ alarm.eventCode }}]</span>
              </dd>
            </div>
            <div class="info-row">
              <dt>Created by rule</dt>
              <dd v-if="alarm.ruleDescription || alarm.ruleGUID">
                {{ alarm.ruleDescription || 'Unnamed rule' }}
                <span class="monospace text-muted">({{ alarm.ruleGUID }})</span>
              </dd>
              <dd v-else class="text-muted">-</dd>
            </div>
          </dl>
        </InfoCard>

        <InfoCard title="Details">
          <dl class="info-list">
            <div class="info-row">
              <dt>Created</dt>
              <dd>{{ formatDate(alarm.creationTime) }}</dd>
            </div>
            <div class="info-row">
              <dt>Last change</dt>
              <dd>{{ formatDate(alarm.lastChangeTime) }}</dd>
            </div>
            <div class="info-row">
              <dt>Repeat count</dt>
              <dd>{{ alarm.repeatCount ?? 1 }}</dd>
            </div>
            <div class="info-row">
              <dt>Acknowledged by</dt>
              <dd>{{ rowField('ackByUserName') ?? '-' }}</dd>
            </div>
            <div class="info-row">
              <dt>Resolved by</dt>
              <dd>{{ rowField('resolvedByUserName') ?? '-' }}</dd>
            </div>
            <div class="info-row">
              <dt>Helpdesk</dt>
              <dd>{{ rowField('helpdeskReference') || '-' }}</dd>
            </div>
            <div v-if="alarm.impact" class="info-row">
              <dt>Impact</dt>
              <dd>{{ alarm.impact }}</dd>
            </div>
            <div v-if="categoryNames.length" class="info-row">
              <dt>Categories</dt>
              <dd class="categories">
                <Tag v-for="name in categoryNames" :key="name" :value="name" severity="secondary" />
              </dd>
            </div>
          </dl>
        </InfoCard>
      </div>

      <InfoCard title="Message" class="section-card">
        <p class="message-text">{{ alarm.message }}</p>
      </InfoCard>

      <InfoCard title="Related Events" class="section-card">
        <AlarmRelatedEventsSection :alarm-id="props.alarmId" />
      </InfoCard>

      <InfoCard title="Comments" class="section-card">
        <AlarmCommentsSection :alarm-id="props.alarmId" :can-edit="canEditComments" />
      </InfoCard>

      <InfoCard title="DCI Data" class="section-card" :collapsed="!hasDci">
        <p v-if="!hasDci" class="dci-empty">No DCI associated with this alarm</p>
        <template v-else>
          <div class="dci-summary">
            <div class="dci-summary-main">
              <span class="dci-description">{{ dciItem?.description ?? `DCI #${dciId}` }}</span>
              <span v-if="dciItem" v-tooltip.bottom="dciValueTooltip" class="dci-value">
                {{ dciValueText }}
              </span>
            </div>
            <Tag
              v-if="dciItem?.hasActiveThreshold"
              value="Threshold active"
              severity="danger"
              outlined
            />
          </div>
          <template v-if="isDciHistoryLoading">
            <TableSkeleton v-if="isStringDci" :columns="['180fr', '320fr']" :rows="10" />
            <ChartSkeleton v-else height="200px" />
          </template>
          <div v-else-if="!hasHistoryData" class="dci-no-data">
            <i class="pi pi-inbox dci-no-data-icon" />
            <span>No data has been collected for this DCI</span>
          </div>
          <DciStringHistory v-else-if="isStringDci" :history-data="historyData" />
          <DciHistoryChart v-else :history-data="historyData" />
        </template>
      </InfoCard>
    </div>
  </div>
</template>

<style scoped>
.alarm-detail-view {
  display: flex;
  flex-direction: column;
}

.alarm-detail-view.embedded {
  height: 100%;
  min-height: 0;
}

.alarm-detail-body {
  padding: 1rem;
  background: var(--p-surface-ground);
  max-width: 1400px;
  margin: 0 auto;
}

/* ViewContainer clips overflow, so the embedded view scrolls internally. */
.alarm-detail-view.embedded .alarm-detail-body {
  flex: 1;
  overflow-y: auto;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  align-items: stretch;
}

@media (max-width: 900px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.info-row {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row dt {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.info-row dd {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  word-break: break-word;
}

.inline-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.source-link {
  padding: 0;
}

.monospace {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  word-break: break-all;
}

.text-muted {
  color: var(--p-text-muted-color);
  font-weight: 400;
}

.capitalize {
  text-transform: capitalize;
}

.categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.message-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9375rem;
}

.section-card {
  margin-bottom: 0.75rem;
}

.dci-empty {
  color: var(--p-text-muted-color);
  font-style: italic;
  margin: 0.25rem 0;
}

.dci-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.625rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.dci-summary-main {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.dci-description {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.dci-value {
  font-family: var(--font-mono);
  font-size: 1.0625rem;
  font-weight: 600;
  word-break: break-word;
}

.dci-no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 200px;
  border: 1px dashed var(--p-surface-border);
  border-radius: var(--p-border-radius-lg, 8px);
  background: color-mix(in srgb, var(--p-surface-ground) 65%, transparent);
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.dci-no-data-icon {
  font-size: 1.75rem;
  opacity: 0.6;
}
</style>
