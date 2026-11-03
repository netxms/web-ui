<script setup>
/**
 * Dialogs behind the interface actions of the object menu, mounted once at app level. The
 * actions only dispatch `interface:*` document events.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useQueryClient } from '@tanstack/vue-query'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import CreateInterfaceDciDialog from '@/components/objects/CreateInterfaceDciDialog.vue'
import { adaptObject } from '@/api/objectAdapters'
import { getObject, updateObjectProperties } from '@/api/objectsApi'
import { objectKeys } from '@/queries/useObjectQueries'
import { notify } from '@/utils/notify'
import { createClassSelectionFilter, DEFAULT_NAVIGABLE_CLASSES } from '@/utils/objectSelection'

const confirm = useConfirm()
const queryClient = useQueryClient()

const dciInterfaces = ref([])
const dciDialogVisible = ref(false)

function onCreateDcis(event) {
  dciInterfaces.value = event.detail?.objects ?? []
  if (dciInterfaces.value.length) dciDialogVisible.value = true
}

const peerSource = ref(null)
const peerPickerVisible = ref(false)

const peerFilter = createClassSelectionFilter(['Interface'], {
  navigableClasses: [...DEFAULT_NAVIGABLE_CLASSES, 'Node'],
})

function isPeerCandidate(node) {
  return peerFilter.selectable(node) && node.id !== peerSource.value?.id
}

/** Peer fields are not on tree rows, and may have changed. */
async function fetchFresh(id) {
  const raw = await queryClient.fetchQuery({
    queryKey: objectKeys.detail(id),
    queryFn: () => getObject(id),
    staleTime: 0,
  })
  return adaptObject(raw)
}

function invalidatePeers(ids) {
  for (const id of ids) queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) })
  queryClient.invalidateQueries({ queryKey: ['objects', 'children'] })
}

function confirmAsync(options) {
  return new Promise((resolve) => {
    confirm.require({
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      ...options,
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    })
  })
}

function reportPeerError(err, summary) {
  // 403 is already toasted by api/client.js.
  if (err?.status === 403) return
  notify({ severity: 'error', summary, detail: err?.message, life: 5000 })
}

function onSetPeer(event) {
  peerSource.value = event.detail?.object ?? null
  if (peerSource.value) peerPickerVisible.value = true
}

// The server clears whatever either end was linked to before, so that is confirmed first.
async function onPeerPicked(picked) {
  const source = peerSource.value
  if (!source || !picked) return
  try {
    const [local, remote] = await Promise.all([fetchFresh(source.id), fetchFresh(picked.id)])
    if (local.peerInterfaceId || remote.peerInterfaceId) {
      const proceed = await confirmAsync({
        header: 'Replace Peer',
        message:
          'One of these interfaces already has a peer. Setting this link removes the existing ' +
          'peer information. Continue?',
        acceptProps: { label: 'Replace', severity: 'danger' },
      })
      if (!proceed) return
    }
    await updateObjectProperties(source.id, { peer: picked.id })
    invalidatePeers([source.id, picked.id, local.peerInterfaceId, remote.peerInterfaceId])
    notify({ summary: 'Peer set', detail: `${local.name} - ${remote.name}` })
  } catch (err) {
    reportPeerError(err, 'Could not set peer')
  }
}

async function onClearPeer(event) {
  const iface = event.detail?.object
  if (!iface) return
  const proceed = await confirmAsync({
    header: 'Clear Peer',
    message: `Remove peer information from interface ${iface.name}? The peer interface loses its link too.`,
    acceptProps: { label: 'Clear', severity: 'danger' },
  })
  if (!proceed) return
  try {
    const peerId = iface.peerInterfaceId
    await updateObjectProperties(iface.id, { peer: null })
    invalidatePeers([iface.id, peerId])
    notify({ summary: 'Peer cleared', detail: iface.name })
  } catch (err) {
    reportPeerError(err, 'Could not clear peer')
  }
}

onMounted(() => {
  document.addEventListener('interface:createDcis', onCreateDcis)
  document.addEventListener('interface:setPeer', onSetPeer)
  document.addEventListener('interface:clearPeer', onClearPeer)
})

onUnmounted(() => {
  document.removeEventListener('interface:createDcis', onCreateDcis)
  document.removeEventListener('interface:setPeer', onSetPeer)
  document.removeEventListener('interface:clearPeer', onClearPeer)
})
</script>

<!-- Mounted only while open: the picker loads the whole object tree. -->
<template>
  <CreateInterfaceDciDialog
    v-if="dciDialogVisible"
    v-model:visible="dciDialogVisible"
    :interfaces="dciInterfaces"
  />
  <AllObjectsPickerDialog
    v-if="peerPickerVisible"
    v-model:visible="peerPickerVisible"
    :title="peerSource ? `Select Peer for ${peerSource.name}` : 'Select Peer Interface'"
    :perspective-classes="['ServiceRoot', 'Network']"
    :selectable="isPeerCandidate"
    :display-filter="peerFilter.displayFilter"
    @select="onPeerPicked"
  />
</template>
