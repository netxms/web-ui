<script setup>
/**
 * Every incident lifecycle action and its dialogs, so the table and the detail view behave
 * identically. Callers decide whether an action is offered (guards in incidentDisplay.js).
 * Confirmation wording matches the legacy client.
 */
import { ref, computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import IncidentCommentDialog from '@/components/incidents/IncidentCommentDialog.vue'
import AssignIncidentDialog from '@/components/incidents/AssignIncidentDialog.vue'
import {
  useChangeIncidentState,
  useAssignIncident,
  useAddIncidentComment,
} from '@/queries/useIncidentQueries'
import { INCIDENT_STATE } from '@/utils/incidentDisplay'

const confirm = useConfirm()
const toast = useToast()

const { mutateAsync: changeState, isPending: isChangingState } = useChangeIncidentState()
const { mutateAsync: assignMutation, isPending: isAssigning } = useAssignIncident()
const { mutateAsync: addComment, isPending: isCommenting } = useAddIncidentComment()

const isMutating = computed(() => isChangingState.value || isAssigning.value || isCommenting.value)

const target = ref(null)
const blockVisible = ref(false)
const commentVisible = ref(false)
const assignVisible = ref(false)

function reportError(summary, e) {
  toast.add({ severity: 'error', summary, detail: e?.message, life: 4000 })
}

async function setState(incident, state, { comment = null, errorMessage } = {}) {
  try {
    await changeState({ incidentId: incident.id, state, comment })
  } catch (e) {
    reportError(errorMessage, e)
  }
}

function start(incident) {
  return setState(incident, INCIDENT_STATE.IN_PROGRESS, {
    errorMessage: 'Failed to change incident state',
  })
}

function reopen(incident) {
  return setState(incident, INCIDENT_STATE.OPEN, {
    errorMessage: 'Failed to reopen incident',
  })
}

// Both cascade to the linked alarms.

function resolve(incident) {
  confirm.require({
    header: 'Resolve Incident',
    message:
      'Are you sure you want to resolve this incident? All linked alarms will also be resolved.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Resolve',
    rejectLabel: 'Cancel',
    accept: () =>
      setState(incident, INCIDENT_STATE.RESOLVED, {
        errorMessage: 'Failed to resolve incident',
      }),
  })
}

function close(incident) {
  confirm.require({
    header: 'Close Incident',
    message: 'Are you sure you want to close this incident? All linked alarms will be terminated.',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: 'Close',
    rejectLabel: 'Cancel',
    accept: () =>
      setState(incident, INCIDENT_STATE.CLOSED, {
        errorMessage: 'Failed to close incident',
      }),
  })
}

function block(incident) {
  target.value = incident
  blockVisible.value = true
}

function comment(incident) {
  target.value = incident
  commentVisible.value = true
}

function assign(incident) {
  target.value = incident
  assignVisible.value = true
}

async function onBlockSubmit(text) {
  // The dialog enforces non-empty; the server would answer RCC_COMMENT_REQUIRED.
  await setState(target.value, INCIDENT_STATE.BLOCKED, {
    comment: text,
    errorMessage: 'Failed to block incident',
  })
  blockVisible.value = false
}

async function onCommentSubmit(text) {
  try {
    await addComment({ incidentId: target.value.id, text })
    commentVisible.value = false
  } catch (e) {
    reportError('Failed to add comment', e)
  }
}

async function onAssignSubmit({ userId }) {
  try {
    await assignMutation({ incidentId: target.value.id, userId })
    assignVisible.value = false
  } catch (e) {
    reportError('Failed to assign incident', e)
  }
}

defineExpose({ start, reopen, resolve, close, block, comment, assign, isMutating })
</script>

<template>
  <IncidentCommentDialog
    v-model:visible="blockVisible"
    header="Block Incident"
    label="Reason for blocking"
    confirm-label="Block"
    required
    :is-pending="isChangingState"
    @submit="onBlockSubmit"
  />

  <IncidentCommentDialog
    v-model:visible="commentVisible"
    header="Add Comment"
    label="Comment"
    :is-pending="isCommenting"
    @submit="onCommentSubmit"
  />

  <AssignIncidentDialog
    v-model:visible="assignVisible"
    :current-user-id="target?.assignedUserId ?? 0"
    :is-pending="isAssigning"
    @assign="onAssignSubmit"
  />
</template>
