<script setup>
import { computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import Tag from 'primevue/tag'
import StatusTag from '@/components/common/StatusTag.vue'
import Skeleton from 'primevue/skeleton'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import {
  useObject,
  useObjectChildren,
  useDciCurrentValues,
  useObjectStatusExplanation,
} from '@/queries/useObjectQueries'
import { useAlarms } from '@/queries/useAlarmQueries'
import { getStatusInfo } from '@/utils/objectUtils'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import {
  statusOriginSummary,
  buildStatusIssueRows,
  noStatusIssuesNote,
} from '@/utils/statusExplanation'
import { isViewConfirmedCompatible } from '@/config/objectViews'
import { getOverviewCards } from '@/config/overviewCards'
import { NO_STATUS_EXPLANATION_CLASSES } from '@/actions/objectActions'
import { objectTarget } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'
import { formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const objectId = computed(() => props.object?.id)
const isCollector = computed(() => props.object?.class === 'Collector')

const { data: currentObject, isLoading, isFetching, isError, error, refetch } = useObject(objectId)
const {
  data: children,
  isLoading: isLoadingChildren,
  isFetching: isFetchingChildren,
  isError: isErrorChildren,
  error: errorChildren,
  refetch: refetchChildren,
} = useObjectChildren(objectId)

const alarmParams = computed(() => ({ rootObject: objectId.value, state: 0 }))
const {
  data: alarms,
  isLoading: isLoadingAlarms,
  isFetching: isFetchingAlarms,
  isError: isErrorAlarms,
  error: errorAlarms,
  refetch: refetchAlarms,
} = useAlarms(alarmParams)

const {
  data: dcis,
  isFetching: isFetchingDcis,
  isError: isErrorDcis,
  error: errorDcis,
  refetch: refetchDcis,
} = useDciCurrentValues(objectId, { enabled: isCollector })

// Not part of `isAnyError`: losing this annotation must not blank the whole view. Shared with
// the Explain Status dialog's query.
const {
  data: statusExplanation,
  isFetching: isFetchingExplanation,
  refetch: refetchExplanation,
} = useObjectStatusExplanation(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => {
    refetch()
    refetchChildren()
    refetchAlarms()
    refetchExplanation()
    if (isCollector.value) refetchDcis()
  })
}

const details = computed(() => currentObject.value ?? props.object)
const childList = computed(() => children.value ?? [])
const alarmList = computed(() => alarms.value ?? [])
const dciList = computed(() => dcis.value ?? [])

// Critical first, Normal last
const STATUS_ORDER = [4, 3, 2, 1, 0]
// Children can also be Unknown, Unmanaged or Disabled; those follow Normal.
const CHILD_STATUS_ORDER = [...STATUS_ORDER, 5, 6, 7]

const childStatusCounts = computed(() => {
  const counts = {}
  for (const child of childList.value) {
    const s = child.status ?? 0
    counts[s] = (counts[s] ?? 0) + 1
  }
  return counts
})

// Normal always shows; other statuses only with a count.
const childStatusRows = computed(() =>
  CHILD_STATUS_ORDER.filter((s) => s === 0 || (childStatusCounts.value[s] ?? 0) > 0).map((s) => ({
    ...getStatusInfo(s),
    statusCode: s,
    count: childStatusCounts.value[s] ?? 0,
  })),
)

const alarmSeverityCounts = computed(() => {
  const counts = {}
  for (const alarm of alarmList.value) {
    const s = typeof alarm.severity === 'number' ? alarm.severity : 0
    counts[s] = (counts[s] ?? 0) + 1
  }
  return counts
})

const alarmBreakdownRows = computed(() =>
  STATUS_ORDER.filter((s) => (alarmSeverityCounts.value[s] ?? 0) > 0).map((s) => ({
    ...getStatusInfo(s),
    statusCode: s,
    count: alarmSeverityCounts.value[s] ?? 0,
  })),
)

const totalAlarms = computed(() => alarmList.value.length)

const OFFENDER_LIMIT = 5

// Children whose own or propagated status is a problem, contributors first (see
// utils/statusExplanation).
const statusIssueRows = computed(() =>
  buildStatusIssueRows(childList.value, statusExplanation.value),
)

const worstOffenders = computed(() => statusIssueRows.value.slice(0, OFFENDER_LIMIT))

/** Header note, so a truncated list never looks complete. */
const statusIssuesSummary = computed(() =>
  statusIssueRows.value.length > OFFENDER_LIMIT
    ? `Showing ${OFFENDER_LIMIT} of ${statusIssueRows.value.length}`
    : null,
)

const statusOrigin = computed(() =>
  statusOriginSummary(statusExplanation.value, childList.value.length),
)

const noIssuesNote = computed(() => noStatusIssuesNote(childList.value))

const hasComments = computed(() => !!details.value?.comments?.trim())

const renderedComments = computed(() =>
  hasComments.value ? renderCommentsMarkdown(details.value.comments) : '',
)

const isInMaintenance = computed(() => details.value?.isInMaintenanceMode ?? false)

function formatDate(dateStr) {
  if (!dateStr) return null
  return formatDateTime(dateStr)
}

const dciCount = computed(() => dciList.value.length)

const isAnyLoading = computed(
  () => isLoading.value || isLoadingChildren.value || isLoadingAlarms.value,
)

const isAnyFetching = computed(
  () =>
    (isFetching.value ||
      isFetchingChildren.value ||
      isFetchingAlarms.value ||
      isFetchingExplanation.value ||
      (isCollector.value && isFetchingDcis.value)) &&
    !isAnyLoading.value,
)

const isAnyError = computed(
  () =>
    isError.value ||
    isErrorChildren.value ||
    isErrorAlarms.value ||
    (isCollector.value && isErrorDcis.value),
)

const overviewError = computed(
  () => error.value || errorChildren.value || errorAlarms.value || errorDcis.value,
)

function retryAll() {
  refetch()
  refetchChildren()
  refetchAlarms()
  refetchExplanation()
  if (isCollector.value) refetchDcis()
}

const router = useRouter()
const { navBindings } = useNavTarget()

/**
 * `navBindings` needs the plain-click handler as its second argument as well, or a left click
 * does nothing.
 */
const alarmsTarget = computed(() =>
  objectTarget(details.value, 'alarms', { perspective: 'infrastructure' }),
)
const statusMapTarget = computed(() =>
  objectTarget(details.value, 'statusMap', { perspective: 'infrastructure' }),
)

function goToAlarms() {
  router.push(alarmsTarget.value)
}

function goToStatusMap() {
  router.push(statusMapTarget.value)
}

// Not every class has a status map (Network does not).
const hasStatusMap = computed(() =>
  isViewConfirmedCompatible('statusMap', details.value?.class, details.value),
)

// Each module card decides itself whether it shows.
const moduleCards = computed(() => getOverviewCards(details.value?.class))

const canExplainStatus = computed(
  () => !NO_STATUS_EXPLANATION_CLASSES.includes(details.value?.class),
)

/** ObjectsView owns the dialog and listens for this. */
function explainStatus() {
  document.dispatchEvent(
    new CustomEvent('object:explainStatus', { detail: { object: details.value } }),
  )
}

/** `AppTable` turns this into the click and the new-tab href. */
function childTarget(child) {
  return objectTarget(child, 'status', { perspective: 'infrastructure' })
}

const offenderColumns = [
  { id: 'name', field: 'name', label: 'Name', width: 260 },
  { id: 'status', field: 'status', label: 'Status', width: 110 },
  { id: 'effect', field: 'contributor', label: 'Effect on Parent', width: 150 },
]

/** The server's own description of this child's propagation. */
function effectTooltip(row) {
  if (row.contributor) {
    return row.propagation
      ? `Drives this object's status. Propagation: ${row.propagation}`
      : "Drives this object's status"
  }
  return `This child is ${getStatusInfo(row.status).label} but propagates ${
    row.propagatedStatusText
  }, so it does not drive this object's status. Propagation: ${row.propagation}`
}
</script>

<template>
  <div class="container-overview" style="position: relative">
    <RefetchIndicator :is-fetching="isAnyFetching" />

    <template v-if="isAnyLoading && !currentObject">
      <div class="card-grid compact">
        <Skeleton height="8rem" />
        <Skeleton height="8rem" />
      </div>
      <Skeleton height="10rem" />
    </template>

    <QueryErrorState
      v-else-if="isAnyError && !currentObject"
      :error="overviewError"
      class="overview-error"
      @retry="retryAll"
    />

    <template v-else>
      <template v-if="isCollector">
        <div class="card-grid three-col">
          <InfoCard title="Reachability">
            <dl class="info-list">
              <div class="info-row">
                <dt>Status</dt>
                <dd>
                  <StatusTag :status="details.status" />
                </dd>
              </div>
              <div v-if="isInMaintenance" class="info-row">
                <dt>Maintenance</dt>
                <dd><Tag value="In Maintenance" severity="warn" icon="pi pi-wrench" /></dd>
              </div>
              <div v-if="details.downSince" class="info-row">
                <dt>Down Since</dt>
                <dd class="text-danger">{{ formatDate(details.downSince) }}</dd>
              </div>
              <div v-if="details.bootTime" class="info-row">
                <dt>Boot Time</dt>
                <dd>{{ formatDate(details.bootTime) }}</dd>
              </div>
            </dl>
          </InfoCard>

          <InfoCard title="Communications">
            <dl class="info-list">
              <div v-if="details.agentPort" class="info-row">
                <dt>Agent Port</dt>
                <dd>{{ details.agentPort }}</dd>
              </div>
              <div v-if="details.agentVersion" class="info-row">
                <dt>Agent Version</dt>
                <dd>{{ details.agentVersion }}</dd>
              </div>
              <div v-if="details.platformName" class="info-row">
                <dt>Platform</dt>
                <dd>{{ details.platformName }}</dd>
              </div>
            </dl>
          </InfoCard>

          <InfoCard title="Collection Health">
            <div class="stat-value">{{ dciCount }}</div>
            <div class="stat-label">total DCIs</div>
            <div class="stat-note">DCI health detail coming soon</div>
          </InfoCard>
        </div>

        <div class="section-divider">
          <span class="section-divider-label">Group Overview</span>
        </div>
      </template>

      <div class="card-grid compact">
        <InfoCard title="Child Status">
          <dl class="info-list">
            <div v-for="row in childStatusRows" :key="row.statusCode" class="info-row status-row">
              <dt>
                <span class="status-dot" :style="{ background: row.color }" />
                {{ row.label }}
              </dt>
              <dd class="status-count">{{ row.count }}</dd>
            </div>
            <div v-if="!childList.length" class="empty-note">No children</div>
          </dl>
        </InfoCard>

        <InfoCard title="Active Alarms">
          <button class="alarm-card-inner" v-bind="navBindings(alarmsTarget, goToAlarms)">
            <div class="stat-value" :class="{ 'stat-value--alert': totalAlarms > 0 }">
              {{ totalAlarms }}
            </div>
            <div class="stat-label">outstanding alarms</div>
            <dl v-if="alarmBreakdownRows.length" class="info-list alarm-breakdown">
              <div
                v-for="row in alarmBreakdownRows"
                :key="row.statusCode"
                class="info-row status-row"
              >
                <dt>
                  <span class="status-dot" :style="{ background: row.color }" />
                  {{ row.label }}
                </dt>
                <dd class="status-count">{{ row.count }}</dd>
              </div>
            </dl>
          </button>
        </InfoCard>
      </div>

      <InfoCard title="Status Issues" :summary="statusIssuesSummary">
        <!-- The status may come from the object's own alarms or DCIs rather than any child. -->
        <p v-if="statusOrigin" class="status-origin">{{ statusOrigin }}</p>

        <!-- AppTable for `targetFor`, which makes ctrl- and middle-click open a new tab. -->
        <AppTable
          v-if="worstOffenders.length"
          :columns="offenderColumns"
          :rows="worstOffenders"
          :target-for="childTarget"
          fit-columns
          class="offenders-table"
        >
          <template #cell="{ col, row }">
            <span v-if="col.id === 'name'" class="child-name">
              <ObjectIcon :object="row" :inactive="row.status === 6" />
              {{ row.name }}
            </span>
            <StatusTag v-else-if="col.id === 'status'" :status="row.status" />
            <span
              v-else-if="row.contributor || row.propagationDiffers"
              v-tooltip.top="effectTooltip(row)"
              class="child-effect"
            >
              <template v-if="row.contributor">
                <i class="pi pi-check" />
                Drives status
              </template>
              <template v-else>Propagates as {{ row.propagatedStatusText }}</template>
            </span>
          </template>
        </AppTable>
        <div
          v-else-if="noIssuesNote"
          class="offenders-empty"
          :class="{ 'offenders-empty--unknown': !noIssuesNote.healthy }"
        >
          <i :class="noIssuesNote.healthy ? 'pi pi-check-circle' : 'pi pi-question-circle'" />
          <span>{{ noIssuesNote.text }}</span>
        </div>

        <div class="offenders-footer">
          <Button
            v-if="hasStatusMap"
            label="View Status Map"
            icon="pi pi-map"
            severity="secondary"
            outlined
            size="small"
            v-bind="navBindings(statusMapTarget, goToStatusMap)"
          />
          <Button
            v-if="canExplainStatus"
            label="Explain Status"
            icon="pi pi-question-circle"
            severity="secondary"
            outlined
            size="small"
            @click="explainStatus"
          />
        </div>
      </InfoCard>

      <InfoCard v-if="hasComments" title="Comments">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="comments-content" v-html="renderedComments" />
      </InfoCard>

      <!-- After the core cards, so a card that appears late pushes none down -->
      <component :is="card.view" v-for="card in moduleCards" :key="card.id" :object="details" />
    </template>
  </div>
</template>

<style scoped>
.container-overview {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-grid {
  display: grid;
  gap: 0.75rem;
}

.card-grid.compact {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.card-grid.three-col {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.overview-error {
  justify-content: center;
  padding: 3rem 1rem;
}

.section-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0.25rem 0;
}

.section-divider::before,
.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--p-surface-border);
}

.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.info-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row dt {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.info-row dd {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: right;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.status-count {
  font-weight: 700;
  font-size: 1rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
}

.stat-value--alert {
  color: var(--p-red-500);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-top: 0.2rem;
}

.stat-note {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-top: 0.5rem;
  font-style: italic;
}

.alarm-card-inner {
  display: block;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.alarm-breakdown {
  margin-top: 0.5rem;
}

.child-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.offenders-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.offenders-empty i {
  color: var(--p-green-500);
  font-size: 1.125rem;
}

.offenders-empty--unknown i {
  color: var(--netxms-status-unknown);
}

.status-origin {
  margin: 0 0 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--p-text-muted-color);
}

.child-effect {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.child-effect .pi-check {
  font-size: 0.75rem;
  color: var(--p-primary-color);
}

.offenders-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-surface-border);
}

.empty-note {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0;
  text-align: center;
}

.comments-content {
  font-size: 0.875rem;
  line-height: 1.6;
}

.text-danger {
  color: var(--p-red-500);
}
</style>
