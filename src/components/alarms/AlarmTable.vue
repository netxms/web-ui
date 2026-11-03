<script setup>
import { formatDateTimeShort } from '@/utils/timeFormat'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'
import { alarmTarget, objectTarget } from '@/utils/routeTargets'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import CreateIncidentDialog from '@/components/incidents/CreateIncidentDialog.vue'
import { incidentTarget } from '@/utils/routeTargets'
import { useToast } from 'primevue/usetoast'
import { useAcknowledgeAlarm, useResolveAlarm, useTerminateAlarm } from '@/queries/useAlarmQueries'
import { useObjectsByIds, useZoneNames } from '@/queries/useObjectQueries'
import { useAlarmTableStore } from '@/stores/alarmTableStore'
import { useWorkingState } from '@/composables/useWorkingState'
import { alarmFilterDefs } from '@/filterDefs/alarmFilterDefs'
import { alarmActionAvailability, normalizeSeverity, normalizeState } from '@/utils/alarmDisplay'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  alarms: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  isFetching: { type: Boolean, default: false },
  isError: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  newAlarmIds: { type: Object, default: () => new Set() },
  hideGoToObject: { type: Boolean, default: false },
  /** Hosts showing several tables in one perspective (a dashboard) give each its own. */
  storageKey: { type: String, default: 'alarms' },
})

const emit = defineEmits(['retry', 'refresh', 'open-details'])

const containerRef = ref(null)
const containerWidth = ref(0)

let resizeObserver = null

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    containerWidth.value = entries[0]?.contentRect.width ?? 0
  })
  resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

const compact = computed(() => containerWidth.value > 0 && containerWidth.value < 780)

// Rows already carry sourceName; fetch the object only where it is missing (deleted object),
// not one GET per distinct source.
const sourceIds = computed(() => [
  ...new Set(props.alarms.filter((a) => a.source && !a.sourceName).map((a) => a.source)),
])
const { objectsById } = useObjectsByIds(sourceIds)
const zoneNames = useZoneNames()

function displaySourceName(alarm) {
  return alarm.sourceName ?? objectsById.value.get(alarm.source)?.name ?? alarm.source
}

function displayZoneName(alarm) {
  return zoneNames.value.get(alarm.zoneUIN) ?? '--'
}

const filterState = ref({ text: '', tokens: [] })

// On an object's Alarms view the filter follows the user to the next object.
useWorkingState(props.storageKey, { view: { filterState } })

/**
 * @param {object} alarm
 * @param {{ key: string, value: string|null }} token
 */
function matchToken(alarm, token) {
  const val = (token.value ?? '').toLowerCase()
  switch (token.key) {
    case 'Severity':
      return normalizeSeverity(alarm.severity) === val
    case 'State':
      return normalizeState(alarm.state) === val
    case 'Source':
      return String(displaySourceName(alarm) ?? '')
        .toLowerCase()
        .includes(val)
    case 'AcknowledgedBy':
      return (alarm.ackByUserName ?? '').toLowerCase().includes(val)
    case 'ResolvedBy':
      return (alarm.resolvedByUserName ?? '').toLowerCase().includes(val)
    case 'HasComments':
      return (alarm.commentCount ?? alarm.comments ?? 0) > 0
    case 'Zone':
      return String(alarm.zoneUIN ?? '').includes(val)
    case 'Event':
      return (alarm.eventName ?? String(alarm.eventCode ?? '')).toLowerCase().includes(val)
    case 'RepeatCount': {
      const count = alarm.repeatCount ?? alarm.count ?? 1
      if (val.startsWith('>')) return count > Number(val.slice(1))
      if (val.startsWith('<')) return count < Number(val.slice(1))
      return String(count) === val
    }
    default:
      return true
  }
}

const filteredAlarms = computed(() => {
  const { text, tokens } = filterState.value

  let result = props.alarms

  if (text) {
    const search = text.toLowerCase()
    result = result.filter(
      (alarm) =>
        String(displaySourceName(alarm) ?? '')
          .toLowerCase()
          .includes(search) ||
        String(alarm.message ?? '')
          .toLowerCase()
          .includes(search) ||
        String(alarm.helpdeskReference ?? '')
          .toLowerCase()
          .includes(search),
    )
  }

  if (tokens.length > 0) {
    result = result.filter((alarm) => {
      let negateNext = false
      for (const token of tokens) {
        if (token.key === 'NOT') {
          negateNext = true
          continue
        }
        const matches = matchToken(alarm, token)
        if (negateNext ? matches : !matches) return false
        negateNext = false
      }
      return true
    })
  }

  return result
})

const store = useAlarmTableStore()

// For narrow containers; the column picker does not apply.
const COMPACT_COLUMNS = [
  { id: 'severity', field: 'severity', label: 'Sev', sortable: true, width: 40 },
  { id: 'state', field: 'state', label: '', sortable: true, width: 36 },
  { id: 'source', field: 'source', label: 'Source', sortable: true, width: 120 },
  { id: 'message', field: 'message', label: 'Message', width: 300 },
  { id: 'lastChangeTime', field: 'lastChangeTime', label: 'Time', sortable: true, width: 100 },
  { id: 'actions', field: null, label: '', width: 36 },
]

// `mandatory` columns cannot be hidden.
const ALL_COLUMNS = [
  { id: 'severity', field: 'severity', label: 'Sev', sortable: true, width: 50, mandatory: true },
  { id: 'state', field: 'state', label: 'State', sortable: true, width: 140, mandatory: true },
  { id: 'source', field: 'source', label: 'Source', sortable: true, width: 150 },
  { id: 'zone', field: 'zoneUIN', label: 'Zone', sortable: true, width: 120 },
  { id: 'message', field: 'message', label: 'Message', width: 400, mandatory: true },
  { id: 'repeatCount', field: 'repeatCount', label: 'Count', sortable: true, width: 70 },
  { id: 'comments', field: 'commentCount', label: 'Comments', sortable: true, width: 100 },
  {
    id: 'helpdeskReference',
    field: 'helpdeskReference',
    label: 'Helpdesk',
    sortable: true,
    width: 130,
  },
  { id: 'ackResolveBy', field: 'resolvedByUserName', label: 'Ack/Resolve By', width: 150 },
  { id: 'created', field: 'creationTime', label: 'Created', sortable: true, width: 140 },
  {
    id: 'lastChangeTime',
    field: 'lastChangeTime',
    label: 'Last Change',
    sortable: true,
    width: 140,
  },
]

const ACTIONS_COLUMN = { id: 'actions', field: null, label: '', width: 40, reorderable: false }

const columns = computed(() => {
  if (compact.value) return COMPACT_COLUMNS
  return [...store.shownColumns(ALL_COLUMNS), ACTIONS_COLUMN]
})

function formatDateCompact(value) {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  // A narrow 24h numeric stamp; `undefined` locale so the field order follows the browser.
  return new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function severityRowClass(data) {
  const sev = normalizeSeverity(data.severity)
  const state = normalizeState(data.state)
  return [
    `severity-row-${sev}`,
    state === 'outstanding' ? 'alarm-row-outstanding' : '',
    props.newAlarmIds.has(data.id) ? 'alarm-row-new' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const router = useRouter()

/** Also the href, for opening in a new tab. */
function objectTargetForAlarm(alarm, viewId = 'alarms') {
  return objectTarget({ id: alarm.source }, viewId, { perspective: 'infrastructure' })
}

function goToObject(alarm, viewId = 'status') {
  if (alarm.source) {
    router.push(objectTargetForAlarm(alarm, viewId))
  }
}

// Navigating action buttons are anchors: only a plain click runs the in-app action.
function onLinkButtonClick(event, run) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  run()
}

const contextMenu = ref()

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const { mutate: acknowledge, isPending: isAcknowledging } = useAcknowledgeAlarm()
const { mutate: resolve, isPending: isResolving } = useResolveAlarm()
const { mutate: terminate, isPending: isTerminating } = useTerminateAlarm()

const toast = useToast()
const createIncidentVisible = ref(false)
const incidentPreset = ref({ object: null, title: '' })
const incidentSourceAlarmId = ref(0)

// Prefills like the legacy AlarmList: source object, message as title, alarm id for the link.
function openCreateIncident(alarm) {
  if (!alarm?.source) return
  incidentPreset.value = {
    object: { id: alarm.source, name: displaySourceName(alarm) },
    title: alarm.message ?? '',
  }
  incidentSourceAlarmId.value = alarm.id
  createIncidentVisible.value = true
}

function onIncidentCreated(incident) {
  if (incident?.id == null) return
  toast.add({
    severity: 'success',
    summary: `Incident #${incident.id} created`,
    detail: incident.title,
    life: 4000,
  })
  router.push(incidentTarget(incident.id))
}

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  const can = alarmActionAvailability(data ? normalizeState(data.state) : 'outstanding')
  return [
    {
      label: 'Details',
      icon: 'pi pi-search-plus',
      command: () => emit('open-details', data),
    },
    ...(props.hideGoToObject
      ? []
      : [
          {
            label: 'Go to Object',
            icon: 'pi pi-external-link',
            disabled: !data?.source,
            command: () => goToObject(data, 'alarms'),
          },
        ]),
    { separator: true },
    {
      label: 'Acknowledge',
      icon: 'pi pi-check',
      disabled: !can.acknowledge,
      command: () => acknowledge(data.id),
    },
    {
      label: 'Resolve',
      icon: 'pi pi-check-circle',
      disabled: !can.resolve,
      command: () => resolve(data.id),
    },
    { separator: true },
    {
      label: 'Create incident',
      icon: 'pi pi-flag',
      disabled: !data?.source,
      command: () => openCreateIncident(data),
    },
    { separator: true },
    {
      label: 'Terminate',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      disabled: !can.terminate,
      command: () => terminate(data.id),
    },
  ]
})

function isMutating() {
  return isAcknowledging.value || isResolving.value || isTerminating.value
}

function rowActions(row) {
  return alarmActionAvailability(normalizeState(row.state))
}
</script>

<template>
  <div
    ref="containerRef"
    class="alarm-table-container"
    :class="{ 'alarm-table-container--compact': compact }"
  >
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        :filter-defs="alarmFilterDefs"
        placeholder="Filter alarms..."
        :size="compact ? 'small' : 'normal'"
        class="filter-input"
      />
      <div class="toolbar-actions">
        <span v-if="!isLoading" class="item-count">{{
          $plural(filteredAlarms.length, 'alarm')
        }}</span>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="emit('refresh')"
        />
        <ColumnChooser
          v-if="!compact"
          v-model="store.visibleColumnIds"
          v-model:order="store.columnOrder"
          :columns="ALL_COLUMNS"
        />
      </div>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      class="section-error"
      @retry="emit('retry')"
    />

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredAlarms"
      sort-field="lastChangeTime"
      :sort-order="-1"
      :row-class="severityRowClass"
      :page-size="20"
      :page-size-options="[10, 20, 50, 100, 500]"
      :storage-key="storageKey"
      :compact="compact"
      :reorderable="!compact"
      expandable
      striped
      size="small"
      resize-fit
      class="alarms-table"
      @row-contextmenu="onRowContextMenu"
      @column-move="store.moveColumn(ALL_COLUMNS, $event)"
    >
      <template #empty>No alarms found.</template>

      <template #cell="{ col, row }">
        <AlarmIconLabel
          v-if="col.id === 'severity' || col.id === 'state'"
          :type="col.id"
          :value="row[col.id]"
          :sticky="row.isSticky"
          collapsible
        />
        <template v-else-if="col.id === 'source'">
          <span class="alarm-source">{{ displaySourceName(row) }}</span>
        </template>
        <template v-else-if="col.id === 'zone'">
          <span v-if="displayZoneName(row) !== '--'">{{ displayZoneName(row) }}</span>
          <span v-else class="text-muted">--</span>
        </template>
        <template v-else-if="col.id === 'message'">
          <span class="alarm-message">{{ row.message }}</span>
        </template>
        <template v-else-if="col.id === 'repeatCount'">
          <span v-if="(row.repeatCount ?? row.count ?? 0) > 1" class="count-badge">
            {{ row.repeatCount ?? row.count }}
          </span>
          <span v-else>{{ row.repeatCount ?? row.count ?? 1 }}</span>
        </template>
        <template v-else-if="col.id === 'comments'">
          <span v-if="(row.commentCount ?? 0) > 0" class="count-badge">{{ row.commentCount }}</span>
          <span v-else class="text-muted">--</span>
        </template>
        <template v-else-if="col.id === 'helpdeskReference'">
          <span v-if="row.helpdeskReference" class="helpdesk-link">{{
            row.helpdeskReference
          }}</span>
          <span v-else class="text-muted">-</span>
        </template>
        <template v-else-if="col.id === 'ackResolveBy'">
          <span v-if="row.resolvedByUserName || row.ackByUserName">{{
            row.resolvedByUserName || row.ackByUserName
          }}</span>
          <span v-else class="text-muted">--</span>
        </template>
        <template v-else-if="col.id === 'created'">
          {{ formatDateTimeShort(row.creationTime ?? row.created) }}
        </template>
        <template v-else-if="col.id === 'lastChangeTime'">
          {{
            compact
              ? formatDateCompact(row.lastChangeTime ?? row.lastChange)
              : formatDateTimeShort(row.lastChangeTime ?? row.lastChange)
          }}
        </template>
        <template v-else-if="col.id === 'actions'">
          <Button
            icon="pi pi-ellipsis-v"
            text
            rounded
            severity="secondary"
            size="small"
            class="row-action-btn"
            aria-label="Actions"
            @click.stop="onActionsClick($event, row)"
          />
        </template>
        <template v-else>{{ row[col.field] ?? '--' }}</template>
      </template>

      <template #expansion="{ row }">
        <div class="alarm-detail">
          <div class="alarm-detail-grid">
            <FormField class="detail-field" label="Alarm ID" group>
              <span>{{ row.id }}</span>
            </FormField>
            <FormField class="detail-field" label="Severity" group>
              <AlarmIconLabel type="severity" :value="row.severity" />
            </FormField>
            <FormField class="detail-field" label="State" group>
              <AlarmIconLabel type="state" :value="row.state" :sticky="row.isSticky" />
            </FormField>
            <FormField class="detail-field" label="Source" group>
              <span>{{ displaySourceName(row) }}</span>
            </FormField>
            <FormField class="detail-field" label="Created" group>
              <span>{{ formatDateTimeShort(row.creationTime ?? row.created) }}</span>
            </FormField>
            <FormField class="detail-field" label="Last Change" group>
              <span>{{ formatDateTimeShort(row.lastChangeTime ?? row.lastChange) }}</span>
            </FormField>
            <FormField v-if="row.ackByUserName" class="detail-field" label="Acknowledged By" group>
              <span>{{ row.ackByUserName }}</span>
            </FormField>
            <FormField v-if="row.resolvedByUserName" class="detail-field" label="Resolved By" group>
              <span>{{ row.resolvedByUserName }}</span>
            </FormField>
            <FormField v-if="row.helpdeskReference" class="detail-field" label="Helpdesk" group>
              <span>{{ row.helpdeskReference }}</span>
            </FormField>
            <FormField
              v-if="row.commentCount ?? row.comments"
              class="detail-field"
              label="Comments"
              group
            >
              <span>{{ row.commentCount ?? row.comments }}</span>
            </FormField>
          </div>

          <div class="detail-message">
            <span class="detail-message-label">Message</span>
            <p>{{ row.message }}</p>
          </div>

          <div class="detail-actions">
            <Button
              as="a"
              class="link-button"
              :href="resolveHref(alarmTarget(row.id))"
              label="Details"
              icon="pi pi-search-plus"
              size="small"
              severity="secondary"
              outlined
              @click="onLinkButtonClick($event, () => emit('open-details', row))"
            />
            <Button
              v-if="!hideGoToObject"
              :as="row.source ? 'a' : undefined"
              class="link-button"
              :href="row.source ? resolveHref(objectTargetForAlarm(row)) : undefined"
              label="Go to Object"
              icon="pi pi-external-link"
              size="small"
              severity="secondary"
              outlined
              :disabled="!row.source"
              @click="onLinkButtonClick($event, () => goToObject(row, 'alarms'))"
            />
            <Button
              label="Acknowledge"
              icon="pi pi-check"
              size="small"
              severity="secondary"
              outlined
              :disabled="!rowActions(row).acknowledge || isMutating(row.id)"
              @click="acknowledge(row.id)"
            />
            <Button
              label="Resolve"
              icon="pi pi-check-circle"
              size="small"
              severity="success"
              outlined
              :disabled="!rowActions(row).resolve || isMutating(row.id)"
              @click="resolve(row.id)"
            />
            <Button
              label="Terminate"
              icon="pi pi-trash"
              size="small"
              severity="danger"
              outlined
              :disabled="!rowActions(row).terminate || isMutating(row.id)"
              @click="terminate(row.id)"
            />
          </div>
        </div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <CreateIncidentDialog
      v-model:visible="createIncidentVisible"
      :preset-object="incidentPreset.object"
      :preset-title="incidentPreset.title"
      :source-alarm-id="incidentSourceAlarmId"
      @created="onIncidentCreated"
    />
  </div>
</template>

<style scoped>
.alarm-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 360px;
}

.alarm-table-container--compact .section-toolbar {
  padding: 0.25rem 0.5rem;
}

.alarm-table-container--compact .filter-input {
  flex: 1;
  min-width: 0;
  max-width: 240px;
  width: auto;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.section-loading {
  padding: 1rem;
}

.section-error {
  padding: 1rem;
  justify-content: center;
}

.alarms-table {
  flex: 1;
  min-height: 0;
}

/* Applied via rowClass */
:deep(.severity-row-critical) {
  border-left: 3px solid var(--netxms-status-critical);
}

:deep(.severity-row-major) {
  border-left: 3px solid var(--netxms-status-major);
}

:deep(.severity-row-warning) {
  border-left: 3px solid var(--netxms-status-warning);
}

:deep(.severity-row-minor) {
  border-left: 3px solid var(--netxms-status-minor);
}

.alarm-message {
  display: block;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-source {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-color);
  background: var(--p-surface-200);
  border-radius: 1rem;
}

.helpdesk-link {
  color: var(--p-primary-color);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.alarm-detail {
  padding: 1rem 1.5rem;
  background: var(--p-surface-ground);
}

.alarm-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.625rem 0.75rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
}

.detail-field label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.detail-field span {
  font-size: 0.875rem;
  font-weight: 500;
}

.detail-message {
  margin-top: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 0.375rem;
}

.detail-message-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.detail-message p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-surface-border);
}

.link-button {
  text-decoration: none;
}

@keyframes alarm-new-in {
  0% {
    transform: translateX(-12px);
    background-color: rgba(234, 179, 8, 0.25);
  }
  30% {
    transform: translateX(0);
    background-color: rgba(234, 179, 8, 0.15);
  }
  100% {
    transform: translateX(0);
    background-color: transparent;
  }
}

:deep(.alarm-row-new) {
  animation: alarm-new-in 2.5s ease-out forwards;
}

@keyframes alarm-sev-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

:deep(.severity-row-critical.alarm-row-outstanding .alarm-icon-label--severity .status-icon) {
  animation: alarm-sev-pulse 2s ease-in-out infinite;
}

:deep(.severity-row-major.alarm-row-outstanding .alarm-icon-label--severity .status-icon) {
  animation: alarm-sev-pulse 2.5s ease-in-out infinite;
}
</style>
