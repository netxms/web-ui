<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { errorMessage } from '@/api/client'
import { deleteObject } from '@/api/objectsApi'
import { dciChoiceFor } from '@/utils/objectDeletion'
import { useTheme } from '@/composables/useTheme'
import GlobalSearch from '@/components/search/GlobalSearch.vue'
import RenameObjectDialog from '@/components/objects/RenameObjectDialog.vue'
import EffectiveRightsDialog from '@/components/objects/EffectiveRightsDialog.vue'
import ScreenshotDialog from '@/components/objects/ScreenshotDialog.vue'
import InterfaceActionDialogs from '@/components/objects/InterfaceActionDialogs.vue'
import DeleteWithDciChoiceDialog from '@/components/objects/DeleteWithDciChoiceDialog.vue'
import ReconnectingToast from '@/components/layout/ReconnectingToast.vue'
import AlarmToast from '@/components/layout/AlarmToast.vue'
import ActionFeedbackPill from '@/components/layout/ActionFeedbackPill.vue'
import ReconnectingOverlay from '@/components/layout/ReconnectingOverlay.vue'
import { useAuthStore } from '@/stores/authStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useSessionSync } from '@/composables/useSessionSync'
import { queryClient, resyncAfterReconnect } from '@/queries/config'

useTheme()
const authStore = useAuthStore()
const connectionStore = useConnectionStore()
const toast = useToast()
const confirm = useConfirm()
const router = useRouter()

// Log this tab out when another tab logs out.
useSessionSync(router, authStore)

// api/client.js toasts 403s for writes only, but a double click or a bulk action can still repeat
// the same denial: collapse identical messages into the toast already showing.
const FORBIDDEN_DEDUPE_MS = 3000
let lastForbidden = { detail: null, at: 0 }

function onForbidden(event) {
  // The WebAPI explains a denial in `reason`, not `message`, which errorMessage() reads.
  const detail = errorMessage(event?.detail, 'You do not have permission to perform this action.')
  const now = Date.now()
  if (detail === lastForbidden.detail && now - lastForbidden.at < FORBIDDEN_DEDUPE_MS) return
  lastForbidden = { detail, at: now }

  toast.add({ severity: 'error', summary: 'Access Denied', detail, life: 5000 })
}

// Generic toast for non-component code (see src/utils/notify.js).
function onNotify({ detail }) {
  if (!detail?.summary) return
  toast.add({
    severity: detail.severity ?? 'success',
    summary: detail.summary,
    detail: detail.detail,
    life: detail.life ?? 3000,
  })
}

function onNotImplemented({ detail }) {
  toast.add({
    severity: 'warn',
    summary: 'Not implemented yet',
    detail: detail?.label
      ? `"${detail.label}" is not available in this version.`
      : 'This action is not available in this version.',
    life: 4000,
  })
}

function onServerUnavailable() {
  if (!authStore.isAuthenticated) return
  connectionStore.startReconnecting()
}

function onReconnected({ detail }) {
  resyncAfterReconnect(queryClient, { outageStartedAt: detail?.outageStartedAt })
}

function onObjectManagedChanged({ detail }) {
  toast.add({
    severity: detail.success ? 'success' : 'error',
    summary: detail.success
      ? detail.managed
        ? 'Object managed'
        : 'Object unmanaged'
      : 'Operation failed',
    detail: detail.name,
    life: 3000,
  })
}

/**
 * Two toasts, not one verdict: a selection can come back part changed and part refused,
 * and saying only "operation failed" hides the objects that really did move.
 */
function onObjectMaintenanceChanged({ detail }) {
  const { maintenance, succeeded = [], failed = [] } = detail

  if (succeeded.length > 0) {
    const plural = succeeded.length > 1
    toast.add({
      severity: 'success',
      summary: maintenance
        ? plural
          ? `Maintenance started for ${succeeded.length} objects`
          : 'Maintenance started'
        : plural
          ? `Maintenance ended for ${succeeded.length} objects`
          : 'Maintenance ended',
      detail: plural ? undefined : succeeded[0].name,
      life: 3000,
    })
  }

  // 403 is already toasted by api/client.js; anything else needs saying here.
  const reportable = failed.filter((failure) => failure.status !== 403)
  if (reportable.length > 0) {
    const plural = reportable.length > 1
    toast.add({
      severity: 'error',
      summary: plural
        ? `Could not change maintenance mode for ${reportable.length} objects`
        : maintenance
          ? 'Could not start maintenance'
          : 'Could not end maintenance',
      detail: plural
        ? reportable.map((failure) => failure.name).join(', ')
        : (reportable[0].message ?? reportable[0].name),
      life: 5000,
    })
  }
}

/** Object dialogs any perspective's context menu can open, kept here so they cannot drift apart. */
const renameTarget = ref(null)
const renameVisible = ref(false)

function onObjectRename({ detail }) {
  renameTarget.value = detail.object
  renameVisible.value = true
}

const effectiveRightsTarget = ref(null)
const effectiveRightsVisible = ref(false)

function onObjectEffectiveRights({ detail }) {
  effectiveRightsTarget.value = detail.object
  effectiveRightsVisible.value = true
}

const screenshotTarget = ref(null)
const screenshotSession = ref('')
const screenshotVisible = ref(false)

function onObjectScreenshot({ detail }) {
  screenshotTarget.value = detail.object
  screenshotSession.value = detail.sessionName ?? ''
  screenshotVisible.value = true
}

/**
 * Delete one or more objects, confirmed first. Lives here because `useConfirm()` needs the app
 * instance. The server answers 204 for "accepted", not "gone", so nothing is removed
 * optimistically. Templates and clusters ask what happens to the DCIs they carry onto members
 * (legacy TemplateDeleteDialog); the answer becomes `removeDCI` for the whole deletion.
 */

// Route param that identifies the open object, per perspective.
const ID_PARAMS = ['objectId', 'dashboardId', 'mapId']

/** Query roots to invalidate for a class, on top of the object tree itself. */
function extraKeysForClass(objectClass) {
  if (objectClass === 'Dashboard' || objectClass === 'DashboardGroup') return [['dashboards']]
  if (objectClass === 'NetworkMap' || objectClass === 'NetworkMapGroup') return [['network-maps']]
  return []
}

function deleteConfirmMessage(objects) {
  if (objects.length > 1) {
    return `Delete ${objects.length} objects? All their child objects will be deleted as well. This cannot be undone.`
  }
  return `Delete "${objects[0].name}"? All child objects will be deleted as well. This cannot be undone.`
}

/** The pending template / cluster deletion waiting for its DCI answer. */
const dciChoiceTarget = ref(null)
const dciChoiceVisible = ref(false)

function onObjectDelete({ detail }) {
  const objects = (detail?.selection?.length ? detail.selection : [detail?.object]).filter(Boolean)
  if (objects.length === 0) return

  const choice = dciChoiceFor(objects)
  if (choice) {
    dciChoiceTarget.value = { objects, choice }
    dciChoiceVisible.value = true
    return
  }

  confirm.require({
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    message: deleteConfirmMessage(objects),
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => runDeletion(objects, { removeDCI: undefined }),
  })
}

function onDciChoiceConfirm(removeDCI) {
  const target = dciChoiceTarget.value
  dciChoiceTarget.value = null
  if (target) runDeletion(target.objects, { removeDCI })
}

/**
 * @param {Array<object>} objects
 * @param {{ removeDCI?: boolean }} options - undefined leaves the server default
 */
async function runDeletion(objects, { removeDCI }) {
  const results = await Promise.allSettled(
    objects.map((object) => deleteObject(object.id, { removeDCI })),
  )

  const failed = results
    .map((result, index) => ({ result, object: objects[index] }))
    .filter(({ result }) => result.status === 'rejected')
  const deleted = objects.filter((_, index) => results[index].status === 'fulfilled')

  // Re-read the tree even on partial failure - some objects may well be gone.
  queryClient.invalidateQueries({ queryKey: ['objects'] })
  for (const object of deleted) {
    for (const key of extraKeysForClass(object.class)) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }

  if (deleted.length > 0) {
    toast.add({
      severity: 'success',
      summary: deleted.length > 1 ? `${deleted.length} objects deleted` : 'Object deleted',
      detail: deleted.length > 1 ? undefined : deleted[0].name,
      life: 3000,
    })

    // Deletion is async, so leave the view now rather than wait for a 404. The perspective picks
    // where to go (a neighbouring tree row) while its tree still holds the deleted rows; home is
    // the fallback.
    const params = router.currentRoute.value.params ?? {}
    const openId = ID_PARAMS.map((name) => params[name]).find((value) => value != null)
    if (openId != null && deleted.some((object) => String(object.id) === String(openId))) {
      const event = new CustomEvent('object:deleted', {
        cancelable: true,
        detail: { objects: deleted },
      })
      if (document.dispatchEvent(event)) router.push({ name: 'home' })
    }
  }

  // 403 is already toasted by api/client.js; anything else needs saying here.
  const reportable = failed.filter(({ result }) => result.reason?.status !== 403)
  if (reportable.length > 0) {
    toast.add({
      severity: 'error',
      summary:
        reportable.length > 1
          ? `Could not delete ${reportable.length} objects`
          : 'Could not delete object',
      detail:
        reportable.length > 1
          ? reportable.map(({ object }) => object.name).join(', ')
          : (reportable[0].result.reason?.message ?? reportable[0].object.name),
      life: 5000,
    })
  }
}

onMounted(() => {
  document.addEventListener('object:rename', onObjectRename)
  document.addEventListener('object:delete', onObjectDelete)
  document.addEventListener('object:effectiveRights', onObjectEffectiveRights)
  document.addEventListener('object:screenshot', onObjectScreenshot)
  window.addEventListener('app:forbidden', onForbidden)
  window.addEventListener('app:notify', onNotify)
  window.addEventListener('app:notImplemented', onNotImplemented)
  window.addEventListener('app:server-unavailable', onServerUnavailable)
  window.addEventListener('app:reconnected', onReconnected)
  window.addEventListener('app:objectManagedChanged', onObjectManagedChanged)
  window.addEventListener('app:objectMaintenanceChanged', onObjectMaintenanceChanged)
})

onUnmounted(() => {
  document.removeEventListener('object:rename', onObjectRename)
  document.removeEventListener('object:delete', onObjectDelete)
  document.removeEventListener('object:effectiveRights', onObjectEffectiveRights)
  document.removeEventListener('object:screenshot', onObjectScreenshot)
  window.removeEventListener('app:forbidden', onForbidden)
  window.removeEventListener('app:notify', onNotify)
  window.removeEventListener('app:notImplemented', onNotImplemented)
  window.removeEventListener('app:server-unavailable', onServerUnavailable)
  window.removeEventListener('app:reconnected', onReconnected)
  window.removeEventListener('app:objectManagedChanged', onObjectManagedChanged)
  window.removeEventListener('app:objectMaintenanceChanged', onObjectMaintenanceChanged)
  connectionStore.stop()
})
</script>

<template>
  <Toast />
  <!-- New-alarm toasts: own outlet, so their position preference does not move other toasts. -->
  <AlarmToast />
  <ConfirmDialog />
  <GlobalSearch v-if="authStore.isAuthenticated" />
  <ReconnectingToast />
  <!-- Small confirmations for actions with no visible result of their own (see notifyAction). -->
  <ActionFeedbackPill />
  <!-- Full-screen blocker for intentional server events (shutdown, maintenance) -->
  <ReconnectingOverlay v-if="connectionStore.serverAlert !== null" />
  <!-- Object dialogs opened by context-menu actions from any perspective.
       v-if unmounts them when closed, so they hold no query subscriptions. -->
  <RenameObjectDialog
    v-if="renameVisible"
    visible
    :object="renameTarget"
    @update:visible="renameVisible = $event"
  />
  <EffectiveRightsDialog
    v-if="effectiveRightsVisible"
    visible
    :object="effectiveRightsTarget"
    @update:visible="effectiveRightsVisible = $event"
  />
  <DeleteWithDciChoiceDialog
    v-if="dciChoiceVisible"
    visible
    :choice="dciChoiceTarget?.choice"
    @update:visible="dciChoiceVisible = $event"
    @confirm="onDciChoiceConfirm"
  />
  <ScreenshotDialog
    v-if="screenshotVisible"
    visible
    :object="screenshotTarget"
    :session-name="screenshotSession"
    @update:visible="screenshotVisible = $event"
  />
  <!-- Interface actions (DCIs, peer); it mounts its own dialogs only while they are open. -->
  <InterfaceActionDialogs v-if="authStore.isAuthenticated" />
  <router-view />
</template>
