<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import IncidentActionDialogs from '@/components/incidents/IncidentActionDialogs.vue'
import IncidentCommentsSection from '@/components/incidents/IncidentCommentsSection.vue'
import IncidentLinkedAlarmsSection from '@/components/incidents/IncidentLinkedAlarmsSection.vue'
import IncidentActivitySection from '@/components/incidents/IncidentActivitySection.vue'
import { useIncident, useUpdateIncidentTitle } from '@/queries/useIncidentQueries'
import { useNavTarget } from '@/composables/useNavTarget'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { aiTarget, objectTarget } from '@/utils/routeTargets'
import { formatDateTimeMedium } from '@/utils/timeFormat'
import {
  getIncidentState,
  canModify,
  canBlock,
  canStart,
  canResolve,
  canReopen,
  canClose,
  canAssign,
  canComment,
} from '@/utils/incidentDisplay'

const props = defineProps({
  incidentId: { type: Number, required: true },
})

const emit = defineEmits(['back'])

const router = useRouter()
const toast = useToast()

const { data: incident, isLoading, isError, error, refetch } = useIncident(() => props.incidentId)

const title = computed(() => `Incident #${props.incidentId}`)

const subtitle = computed(() => {
  if (!incident.value) return null
  const source = incident.value.sourceObjectName ?? `[${incident.value.sourceObjectId}]`
  return `${getIncidentState(incident.value).label} · ${source}`
})

// Title is the only editable field (CMD_UPDATE_INCIDENT).

const isEditingTitle = ref(false)
const draftTitle = ref('')

const { mutateAsync: updateTitle, isPending: isSavingTitle } = useUpdateIncidentTitle()

const canSaveTitle = computed(() => draftTitle.value.trim().length > 0)

// Leave edit mode if the incident is swapped out from under the form.
watch(
  () => props.incidentId,
  () => {
    isEditingTitle.value = false
  },
)

function startTitleEdit() {
  draftTitle.value = incident.value?.title ?? ''
  isEditingTitle.value = true
}

function cancelTitleEdit() {
  isEditingTitle.value = false
}

async function saveTitle() {
  if (!canSaveTitle.value) return
  try {
    await updateTitle({ incidentId: props.incidentId, title: draftTitle.value.trim() })
    isEditingTitle.value = false
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Failed to update incident',
      detail: e?.message,
      life: 4000,
    })
  }
}

const actions = ref()

// Legacy "Discuss with AI": a chat in the AI perspective, bound to this incident.
const { has: hasServerComponent } = useServerComponents()
const { can } = usePermissions()
const { linkBindings } = useNavTarget()
const canDiscussWithAi = computed(
  () => hasServerComponent(SERVER_COMPONENTS.AI_ASSISTANT) && can.value.useAiAssistant,
)
const discussTarget = computed(() => aiTarget('chat', { incidentId: props.incidentId }))

function goToSource() {
  if (incident.value?.sourceObjectId) {
    router.push(
      objectTarget({ id: incident.value.sourceObjectId }, 'status', {
        perspective: 'infrastructure',
      }),
    )
  }
}

function formatDate(value) {
  return formatDateTimeMedium(value)
}

/** "12 Mar 2026, 14:03 by admin", or just the time when the actor is unknown. */
function formatDateBy(value, userName) {
  if (!value) return '-'
  return userName ? `${formatDate(value)} by ${userName}` : formatDate(value)
}
</script>

<template>
  <div class="incident-detail-view">
    <EntityDetailHeader :title="title" :subtitle="subtitle" @back="emit('back')">
      <template #actions>
        <Button
          v-if="canDiscussWithAi"
          as="a"
          v-bind="linkBindings(discussTarget)"
          label="Discuss with AI"
          icon="pi pi-sparkles"
          size="small"
          severity="secondary"
          outlined
        />
        <Button
          label="Start"
          icon="pi pi-play"
          size="small"
          severity="secondary"
          outlined
          :disabled="!canStart(incident)"
          @click="actions.start(incident)"
        />
        <Button
          label="Block"
          icon="pi pi-ban"
          size="small"
          severity="warn"
          outlined
          :disabled="!canBlock(incident)"
          @click="actions.block(incident)"
        />
        <Button
          label="Resolve"
          icon="pi pi-check-circle"
          size="small"
          severity="success"
          outlined
          :disabled="!canResolve(incident)"
          @click="actions.resolve(incident)"
        />
        <Button
          label="Reopen"
          icon="pi pi-replay"
          size="small"
          severity="secondary"
          outlined
          :disabled="!canReopen(incident)"
          @click="actions.reopen(incident)"
        />
        <Button
          label="Close"
          icon="pi pi-lock"
          size="small"
          severity="danger"
          outlined
          :disabled="!canClose(incident)"
          @click="actions.close(incident)"
        />
      </template>
    </EntityDetailHeader>

    <div v-if="isLoading" class="incident-detail-body">
      <Skeleton height="10rem" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      message="Failed to load incident"
      class="incident-detail-error"
      @retry="refetch"
    />

    <div v-else-if="incident" class="incident-detail-body">
      <div class="title-bar">
        <template v-if="isEditingTitle">
          <InputText
            v-model="draftTitle"
            class="title-input"
            maxlength="255"
            autofocus
            @keyup.enter="saveTitle"
            @keyup.esc="cancelTitleEdit"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            size="small"
            :loading="isSavingTitle"
            :disabled="!canSaveTitle"
            @click="saveTitle"
          />
          <Button
            label="Cancel"
            size="small"
            text
            severity="secondary"
            :disabled="isSavingTitle"
            @click="cancelTitleEdit"
          />
        </template>
        <template v-else>
          <h2 class="title-text">{{ incident.title }}</h2>
          <Button
            v-if="canModify(incident)"
            icon="pi pi-pencil"
            size="small"
            text
            rounded
            severity="secondary"
            aria-label="Edit title"
            @click="startTitleEdit"
          />
        </template>
      </div>

      <div class="overview-grid">
        <InfoCard title="Overview">
          <dl class="info-list">
            <div class="info-row">
              <dt>State</dt>
              <dd>
                <Tag
                  :value="getIncidentState(incident).label"
                  :severity="getIncidentState(incident).severity"
                  outlined
                />
              </dd>
            </div>
            <div class="info-row">
              <dt>Source</dt>
              <dd>
                <Button
                  :label="incident.sourceObjectName ?? `[${incident.sourceObjectId}]`"
                  link
                  size="small"
                  class="source-link"
                  :disabled="!incident.sourceObjectId"
                  @click="goToSource"
                />
              </dd>
            </div>
            <div class="info-row">
              <dt>Assignee</dt>
              <dd class="assignee-cell">
                <span v-if="incident.assignedUserName">{{ incident.assignedUserName }}</span>
                <span v-else class="text-muted">Unassigned</span>
                <Button
                  v-if="canAssign(incident)"
                  label="Assign"
                  icon="pi pi-user"
                  size="small"
                  text
                  @click="actions.assign(incident)"
                />
              </dd>
            </div>
            <div class="info-row">
              <dt>Linked alarms</dt>
              <dd>{{ incident.linkedAlarms?.length ?? 0 }}</dd>
            </div>
            <div v-if="incident.sourceAlarmId" class="info-row">
              <dt>Raised from</dt>
              <dd>Alarm [{{ incident.sourceAlarmId }}]</dd>
            </div>
          </dl>
        </InfoCard>

        <InfoCard title="Timeline">
          <dl class="info-list">
            <div class="info-row">
              <dt>Created</dt>
              <dd>{{ formatDateBy(incident.creationTime, incident.createdByUserName) }}</dd>
            </div>
            <div class="info-row">
              <dt>Last change</dt>
              <dd>{{ formatDate(incident.lastChangeTime) }}</dd>
            </div>
            <div class="info-row">
              <dt>Resolved</dt>
              <dd>{{ formatDateBy(incident.resolveTime, incident.resolvedByUserName) }}</dd>
            </div>
            <div class="info-row">
              <dt>Closed</dt>
              <dd>{{ formatDateBy(incident.closeTime, incident.closedByUserName) }}</dd>
            </div>
          </dl>
        </InfoCard>
      </div>

      <InfoCard title="Linked Alarms" class="section-card">
        <IncidentLinkedAlarmsSection
          :alarm-ids="incident.linkedAlarms ?? []"
          :incident-id="incidentId"
        />
      </InfoCard>

      <InfoCard title="Comments" class="section-card">
        <IncidentCommentsSection
          :comments="incident.comments ?? []"
          :can-comment="canComment(incident)"
          @add="actions.comment(incident)"
        />
      </InfoCard>

      <InfoCard title="Activity" class="section-card" collapsed>
        <IncidentActivitySection :incident-id="props.incidentId" />
      </InfoCard>
    </div>

    <IncidentActionDialogs ref="actions" />
  </div>
</template>

<style scoped>
.incident-detail-view {
  display: flex;
  flex-direction: column;
}

.incident-detail-body {
  padding: 1rem;
  background: var(--p-surface-ground);
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.incident-detail-error {
  padding: 1rem;
  justify-content: center;
}

.title-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  min-height: 2.25rem;
}

.title-text {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  word-break: break-word;
}

.title-input {
  flex: 1;
  min-width: 0;
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

.assignee-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.source-link {
  padding: 0;
}

.text-muted {
  color: var(--p-text-muted-color);
  font-weight: 400;
}

.section-card {
  margin-bottom: 0.75rem;
}
</style>
