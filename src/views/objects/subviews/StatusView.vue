<script setup>
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import InfoCard from '@/components/objects/InfoCard.vue'
import ObjectHealthStrip from '@/components/objects/ObjectHealthStrip.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObject } from '@/queries/useObjectQueries'
import {
  isNodeLike,
  formatIpAddress,
  getCapabilityEntries,
  getPollSummary,
  formatSnmpVersion,
} from '@/utils/objectUtils'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const toast = useToast()

const objectId = computed(() => props.object?.id)
const { data: currentObject, isLoading, isFetching, isError, error, refetch } = useObject(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const details = computed(() => currentObject.value ?? props.object)
const isNode = computed(() => isNodeLike(details.value?.class))
const ip = computed(() => formatIpAddress(details.value?.ipAddress))
const allCapabilities = computed(() => getCapabilityEntries(details.value?.capabilities))
const activeCapabilities = computed(() => allCapabilities.value.filter((c) => c.active))
const inactiveCapabilities = computed(() => allCapabilities.value.filter((c) => !c.active))
const showAllCapabilities = ref(false)

const hasGeoLocation = computed(() => {
  const geo = details.value?.geoLocation
  return geo && geo.type !== 0
})

const coordinates = computed(() => {
  if (!hasGeoLocation.value) return null
  const geo = details.value.geoLocation
  return `${geo.latitude.toFixed(6)}, ${geo.longitude.toFixed(6)}`
})

const hasComments = computed(() => !!details.value?.comments?.trim())

const renderedComments = computed(() =>
  hasComments.value ? renderCommentsMarkdown(details.value.comments) : '',
)

const hasSnmp = computed(() => isNode.value && details.value?.capabilities?.isSnmp)

// The port rows collapse into one line: they are rarely read and never individually.
const portEntries = computed(() =>
  [
    { key: 'agent', label: 'Agent', port: details.value?.agentPort },
    { key: 'snmp', label: 'SNMP', port: details.value?.snmpPort },
    { key: 'ssh', label: 'SSH', port: details.value?.ssh?.port },
  ].filter((p) => p.port),
)

// Zone 0 is the default zone.
const zoneUin = computed(() => (details.value?.zoneUIN ? details.value.zoneUIN : null))

const hasCommunications = computed(
  () =>
    isNode.value &&
    (details.value?.primaryName || ip.value || portEntries.value.length || zoneUin.value),
)

const inventoryFields = computed(() => {
  const d = details.value ?? {}
  return [
    { key: 'type', label: 'Node Type', value: d.type },
    { key: 'subType', label: 'Sub Type', value: d.subType },
    { key: 'driverName', label: 'Driver', value: d.driverName },
    { key: 'agentVersion', label: 'Agent Version', value: d.agentVersion },
    { key: 'platformName', label: 'Platform', value: d.platformName },
    { key: 'sysName', label: 'System Name', value: d.sysName },
    { key: 'sysDescription', label: 'System Description', value: d.sysDescription },
    { key: 'sysLocation', label: 'Location', value: d.sysLocation },
    { key: 'sysContact', label: 'Contact', value: d.sysContact },
    { key: 'snmpObjectId', label: 'SNMP OID', value: d.snmpObjectId, monospace: true },
  ].filter((f) => f.value)
})

const hasInventory = computed(() => isNode.value && inventoryFields.value.length > 0)

// Ticks so "polled 40s ago" moves between refetches.
const now = ref(Date.now())
let pollTicker = null
onMounted(() => {
  pollTicker = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onUnmounted(() => clearInterval(pollTicker))

const pollSummary = computed(() => getPollSummary(details.value))

const pollRows = computed(() =>
  (pollSummary.value?.all ?? []).map((poll) => ({
    ...poll,
    age: poll.lastCompleted ? formatAgeCompact(poll.lastCompleted, now.value) : 'never',
    timestamp: formatDateTime(poll.lastCompleted) ?? 'Never completed since server start',
  })),
)

const identitySummary = computed(() =>
  [details.value?.id != null ? `#${details.value.id}` : null, details.value?.class]
    .filter(Boolean)
    .join('  /  '),
)

const communicationsSummary = computed(() => details.value?.primaryName || ip.value || '')

const inventorySummary = computed(() =>
  [details.value?.type, details.value?.driverName].filter(Boolean).join('  /  '),
)

const capabilitiesSummary = computed(
  () => `${activeCapabilities.value.length} of ${allCapabilities.value.length} active`,
)

const pollsSummary = computed(() => {
  const status = pollRows.value.find((p) => p.key === 'status')
  return status ? `Status ${status.age}` : `${pollRows.value.length} poll types`
})

const commentsSummary = computed(() => {
  const text = details.value?.comments?.trim().replace(/\s+/g, ' ') ?? ''
  return text.length > 70 ? `${text.slice(0, 70)}...` : text
})

function copyGuid() {
  const guid = details.value?.guid
  if (!guid) return
  navigator.clipboard.writeText(guid).then(() => {
    toast.add({ severity: 'success', summary: 'Copied', detail: 'GUID copied.', life: 2000 })
  })
}
</script>

<template>
  <div class="status-view" style="position: relative">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <template v-if="isLoading && !currentObject">
      <Skeleton height="3rem" class="strip-skeleton" />
      <div class="card-grid compact">
        <Skeleton height="10rem" />
        <Skeleton height="10rem" />
      </div>
    </template>

    <QueryErrorState v-else-if="isError && !currentObject" :error="error" @retry="refetch" />

    <template v-else>
      <ObjectHealthStrip :object="details" />

      <div class="card-grid compact">
        <InfoCard title="Identity" :summary="identitySummary" persist-key="status.identity">
          <dl class="info-list">
            <div class="info-row">
              <dt>Object ID</dt>
              <dd>{{ details.id }}</dd>
            </div>
            <div class="info-row">
              <dt>Class</dt>
              <dd>{{ details.class }}</dd>
            </div>
            <div v-if="details.alias" class="info-row">
              <dt>Alias</dt>
              <dd>{{ details.alias }}</dd>
            </div>
            <div v-if="details.creationTime" class="info-row">
              <dt>Created</dt>
              <dd>{{ formatDateTime(details.creationTime) }}</dd>
            </div>
            <div v-if="coordinates" class="info-row">
              <dt>Coordinates</dt>
              <dd class="monospace">{{ coordinates }}</dd>
            </div>
          </dl>
          <div v-if="details.guid" class="guid-footnote">
            <span class="guid-label">GUID</span>
            <span v-tooltip.top="details.guid" class="monospace guid-value">
              {{ details.guid }}
            </span>
            <Button
              v-tooltip.top="'Copy GUID'"
              icon="pi pi-copy"
              text
              rounded
              severity="secondary"
              size="small"
              aria-label="Copy GUID"
              class="guid-copy"
              @click="copyGuid"
            />
          </div>
        </InfoCard>

        <!-- Node-like only -->
        <InfoCard
          v-if="hasCommunications"
          title="Communications"
          :summary="communicationsSummary"
          persist-key="status.communications"
        >
          <dl class="info-list">
            <div v-if="details.primaryName" class="info-row">
              <dt>Primary Name</dt>
              <dd>{{ details.primaryName }}</dd>
            </div>
            <div v-if="ip" class="info-row">
              <dt>IP Address</dt>
              <dd class="monospace">{{ ip }}</dd>
            </div>
            <div v-if="zoneUin" class="info-row">
              <dt>Zone</dt>
              <dd>{{ zoneUin }}</dd>
            </div>
            <div v-if="portEntries.length" class="info-row">
              <dt>Ports</dt>
              <dd class="port-chips">
                <span v-for="entry in portEntries" :key="entry.key" class="port-chip">
                  <span class="port-chip-name">{{ entry.label }}</span>
                  <span class="port-chip-value">{{ entry.port }}</span>
                </span>
              </dd>
            </div>
            <div v-if="hasSnmp && details.snmpVersion" class="info-row">
              <dt>SNMP Version</dt>
              <dd>{{ formatSnmpVersion(details.snmpVersion) }}</dd>
            </div>
            <div v-if="hasSnmp && details.snmpCommunity" class="info-row">
              <dt>SNMP Community</dt>
              <dd>{{ details.snmpCommunity }}</dd>
            </div>
          </dl>
        </InfoCard>

        <!-- Collapsed by default; the strip already says when it was last polled. -->
        <InfoCard
          v-if="pollRows.length"
          title="Polls"
          :summary="pollsSummary"
          persist-key="status.polls"
          :collapsed="true"
        >
          <dl class="info-list info-list--wide-label">
            <div v-for="poll in pollRows" :key="poll.key" class="info-row">
              <dt>{{ poll.label }}</dt>
              <dd v-tooltip.top="poll.timestamp" class="poll-age">
                {{ poll.age }}
                <Tag v-if="poll.pending" value="running" severity="info" />
              </dd>
            </div>
          </dl>
        </InfoCard>

        <!-- Node-like only -->
        <InfoCard
          v-if="hasInventory"
          title="Inventory"
          :summary="inventorySummary"
          persist-key="status.inventory"
        >
          <dl class="info-list">
            <div v-for="field in inventoryFields" :key="field.key" class="info-row">
              <dt>{{ field.label }}</dt>
              <dd :class="{ monospace: field.monospace }">{{ field.value }}</dd>
            </div>
          </dl>
        </InfoCard>
      </div>

      <div class="card-grid full">
        <InfoCard
          v-if="isNode && allCapabilities.length"
          title="Capabilities"
          :summary="capabilitiesSummary"
          persist-key="status.capabilities"
        >
          <div class="tag-grid">
            <Tag
              v-for="cap in activeCapabilities"
              :key="cap.key"
              :value="cap.label"
              severity="success"
            />
            <span v-if="!activeCapabilities.length" class="empty-note">None active</span>
          </div>
          <button
            v-if="inactiveCapabilities.length"
            class="capabilities-toggle"
            @click="showAllCapabilities = !showAllCapabilities"
          >
            {{ showAllCapabilities ? 'Hide' : 'Show' }} inactive ({{ inactiveCapabilities.length }})
          </button>
          <div v-if="showAllCapabilities" class="tag-grid capabilities-inactive">
            <Tag
              v-for="cap in inactiveCapabilities"
              :key="cap.key"
              :value="cap.label"
              severity="secondary"
            />
          </div>
        </InfoCard>

        <InfoCard
          v-if="hasComments"
          title="Comments"
          :summary="commentsSummary"
          persist-key="status.comments"
        >
          <div class="comments-content" v-html="renderedComments" />
        </InfoCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-view {
  padding: 1rem;
  /* Past this the label/value columns just drift apart on ultra-wide monitors. */
  max-width: 1600px;
}

.strip-skeleton {
  margin-bottom: 0.75rem;
}

.card-grid {
  display: grid;
  gap: 0.75rem;
  /* Expanded cards share a row height; collapsed cards opt out via `align-self: start`
     (InfoCard.vue) to stay slim bars. */
  align-items: stretch;
}

.card-grid.compact {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  margin-bottom: 0.75rem;
}

.card-grid.full {
  grid-template-columns: 1fr;
}

.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.info-row {
  display: grid;
  /* minmax(0, 1fr): an auto minimum would let an unbreakable value (an SNMP OID) widen the
     row past the card. */
  grid-template-columns: minmax(6.5rem, 9rem) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.info-row:last-child {
  border-bottom: none;
}

/* Poll type names run long enough to crowd their value at the default column width. */
.info-list--wide-label .info-row {
  grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
  gap: 1.5rem;
  /* Not baseline: the "running" tag makes its row taller than the text. */
  align-items: center;
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

.monospace {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.guid-footnote {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
}

.guid-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* A GUID never fits a quarter-width card; it truncates, with the full value on hover and on
   the copy button. */
.guid-value {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guid-copy {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
}

.poll-age {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;
}

.port-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.port-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
  padding: 0.0625rem 0.4375rem;
  border-radius: 4px;
  background: var(--p-surface-100);
}

.port-chip-name {
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

.port-chip-value {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
}

html.app-dark .port-chip {
  background: var(--p-surface-800);
}

.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.empty-note {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.capabilities-toggle {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.75rem;
  color: var(--p-primary-color);
  cursor: pointer;
}

.capabilities-toggle:hover {
  text-decoration: underline;
}

.capabilities-inactive {
  margin-top: 0.375rem;
}

.comments-content {
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
