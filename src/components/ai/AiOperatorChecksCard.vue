<script setup>
/**
 * Standing checks of one AI operator instance (legacy AiOperatorChecks property page): NXSL
 * scripts the server runs on schedule, without the LLM, which wake the operator or record an
 * observation when they fire. Every change is applied immediately, independently of the
 * operator form's Save / Discard.
 */
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import AiOperatorCheckDialog from './AiOperatorCheckDialog.vue'
import {
  useAiOperatorChecks,
  useDeleteAiOperatorCheck,
  useUpdateAiOperatorCheck,
} from '@/queries/useAiOperatorQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { checkVerdict, CHECK_ACTION_OPTIONS } from '@/utils/aiOperatorDisplay'
import { objectTarget } from '@/utils/routeTargets'
import { formatAgeCompact, formatDateTime, formatDurationCompact } from '@/utils/timeFormat'

const props = defineProps({
  operator: { type: Object, required: true },
})

const confirm = useConfirm()
const toast = useToast()

const operatorId = computed(() => props.operator.id)

const { data, isLoading, error, refetch } = useAiOperatorChecks(operatorId)

const checks = computed(() => data.value ?? [])

const objectIds = computed(() => [
  ...new Set(checks.value.map((c) => c.objectId).filter((id) => id > 0)),
])
const { objectsById } = useObjectsByIds(objectIds)

const ACTION_LABELS = Object.fromEntries(CHECK_ACTION_OPTIONS.map((o) => [o.value, o.label]))

const rows = computed(() =>
  checks.value.map((check) => {
    const object = check.objectId > 0 ? objectsById.value.get(check.objectId) : null
    return {
      ...check,
      object,
      objectName: object?.name ?? (check.objectId > 0 ? `[${check.objectId}]` : ''),
      createdByLabel: check.createdBy === 'model' ? 'Operator' : 'User',
      actionLabel: ACTION_LABELS[check.action] ?? check.action,
    }
  }),
)

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 200 },
  { id: 'enabled', field: 'enabled', label: 'Enabled', sortable: true, width: 80 },
  { id: 'locked', field: 'locked', label: 'Locked', sortable: true, width: 80 },
  { id: 'createdBy', field: 'createdByLabel', label: 'Created by', sortable: true, width: 100 },
  { id: 'action', field: 'actionLabel', label: 'Action', sortable: true, width: 150 },
  { id: 'interval', field: 'interval', label: 'Interval', sortable: true, width: 90 },
  { id: 'object', field: 'objectName', label: 'Object', sortable: true, width: 160 },
  { id: 'verdict', field: 'lastVerdict', label: 'Last verdict', sortable: true, width: 120 },
  { id: 'lastFire', field: 'lastFire', label: 'Last fire', sortable: true, width: 100 },
  { id: 'errors', field: 'consecutiveErrors', label: 'Errors', sortable: true, width: 70 },
]

const selectedIds = ref(new Set())

// A check the operator deleted between refreshes must not stay selected.
watch(checks, (list) => {
  const present = new Set(list.map((c) => c.id))
  const kept = [...selectedIds.value].filter((id) => present.has(id))
  if (kept.length !== selectedIds.value.size) selectedIds.value = new Set(kept)
})

const selectedChecks = computed(() => checks.value.filter((c) => selectedIds.value.has(c.id)))
const singleSelected = computed(() =>
  selectedChecks.value.length === 1 ? selectedChecks.value[0] : null,
)

const dialogVisible = ref(false)
const editedCheck = ref(null)

function openCreate() {
  editedCheck.value = null
  dialogVisible.value = true
}

function openEdit(check) {
  if (!check) return
  editedCheck.value = checks.value.find((c) => c.id === check.id) ?? check
  dialogVisible.value = true
}

const { mutate: updateCheck, isPending: isUpdating } = useUpdateAiOperatorCheck()
const { mutateAsync: deleteCheck, isPending: isDeleting } = useDeleteAiOperatorCheck()

function toggleLock() {
  const check = singleSelected.value
  if (!check) return
  updateCheck(
    { operatorId: operatorId.value, checkId: check.id, data: { locked: !check.locked } },
    {
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: check.locked ? 'Could not unlock check' : 'Could not lock check',
          detail: err?.message,
          life: 5000,
        })
      },
    },
  )
}

function confirmDelete() {
  const targets = selectedChecks.value
  if (targets.length === 0) return
  confirm.require({
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    message: 'Selected standing checks will be deleted. Are you sure?',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      const results = await Promise.allSettled(
        targets.map((check) => deleteCheck({ operatorId: operatorId.value, checkId: check.id })),
      )
      selectedIds.value = new Set()

      // 403 is already toasted by api/client.js; anything else needs saying here.
      const reportable = results
        .map((result, index) => ({ result, check: targets[index] }))
        .filter(({ result }) => result.status === 'rejected' && result.reason?.status !== 403)
      if (reportable.length > 0) {
        toast.add({
          severity: 'error',
          summary:
            reportable.length > 1
              ? `Could not delete ${reportable.length} standing checks`
              : 'Could not delete standing check',
          detail:
            reportable.length > 1
              ? reportable.map(({ check }) => check.name).join(', ')
              : (reportable[0].result.reason?.message ?? reportable[0].check.name),
          life: 5000,
        })
      }
    },
  })
}
</script>

<template>
  <DetailCard title="Standing Checks" wide>
    <p class="checks-intro">
      Standing checks are NXSL scripts the server runs on schedule without LLM involvement. Changes
      here are applied immediately.
    </p>

    <div class="checks-toolbar">
      <Button label="Add" icon="pi pi-plus" size="small" @click="openCreate" />
      <Button
        label="Edit"
        icon="pi pi-pencil"
        size="small"
        severity="secondary"
        outlined
        :disabled="!singleSelected"
        @click="openEdit(singleSelected)"
      />
      <Button
        :label="singleSelected?.locked ? 'Unlock' : 'Lock'"
        :icon="singleSelected?.locked ? 'pi pi-lock-open' : 'pi pi-lock'"
        size="small"
        severity="secondary"
        outlined
        :disabled="!singleSelected || isUpdating"
        @click="toggleLock"
      />
      <Button
        label="Delete"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        outlined
        :disabled="selectedChecks.length === 0 || isDeleting"
        @click="confirmDelete"
      />
    </div>

    <LoadingState v-if="isLoading" />
    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :error="error"
      striped
      column-borders
      resize-fit
      selectable
      :selected-ids="selectedIds"
      sort-field="name"
      :sort-order="1"
      class="checks-table"
      @selection-change="selectedIds = $event"
      @row-click="openEdit"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'name'" class="check-name">
          <i
            v-if="row.compileError"
            v-tooltip.top="row.compileError"
            class="pi pi-exclamation-triangle compile-error-icon"
            aria-label="Compilation error"
          />
          {{ row.name }}
        </span>
        <i
          v-else-if="col.id === 'enabled'"
          :class="row.enabled ? 'pi pi-check' : 'pi pi-minus text-muted'"
          :aria-label="row.enabled ? 'Enabled' : 'Disabled'"
        />
        <i
          v-else-if="col.id === 'locked'"
          :class="row.locked ? 'pi pi-lock' : 'pi pi-minus text-muted'"
          :aria-label="row.locked ? 'Locked' : 'Not locked'"
        />
        <span v-else-if="col.id === 'interval'">{{ formatDurationCompact(row.interval) }}</span>
        <AppLink v-else-if="col.id === 'object' && row.object" :to="objectTarget(row.object)">
          {{ row.objectName }}
        </AppLink>
        <span v-else-if="col.id === 'object'" class="text-muted">{{ row.objectName }}</span>
        <span
          v-else-if="col.id === 'verdict'"
          class="status-badge"
          :class="checkVerdict(row.lastVerdict).class"
        >
          <i :class="checkVerdict(row.lastVerdict).icon" />
          {{ checkVerdict(row.lastVerdict).label }}
        </span>
        <span v-else-if="col.id === 'lastFire'" v-tooltip.top="formatDateTime(row.lastFire)">{{
          formatAgeCompact(row.lastFire) || 'Never'
        }}</span>
        <span
          v-else-if="col.id === 'errors'"
          :class="{ 'text-danger': row.consecutiveErrors > 0 }"
          >{{ row.consecutiveErrors ?? 0 }}</span
        >
        <span v-else-if="col.id === 'createdBy'">{{ row.createdByLabel }}</span>
        <span v-else-if="col.id === 'action'">{{ row.actionLabel }}</span>
      </template>
      <template #empty>
        <div class="checks-empty">No standing checks</div>
      </template>
    </AppTable>

    <AiOperatorCheckDialog
      v-model:visible="dialogVisible"
      :operator-id="operatorId"
      :check="editedCheck"
    />
  </DetailCard>
</template>

<style scoped>
.checks-intro {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.checks-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.checks-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
}

.checks-empty {
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.check-name {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 500;
}

.compile-error-icon {
  color: var(--p-orange-500);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.text-danger {
  color: var(--p-red-500);
}

/* Badge colours match the other AI configuration views (assets/styles/ai-section.css). */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
}

.status-ok {
  color: var(--p-green-600);
}

.status-warn {
  color: var(--p-orange-600);
}

.status-error {
  color: var(--p-red-500);
}

.status-muted {
  color: var(--p-text-muted-color);
}
</style>
