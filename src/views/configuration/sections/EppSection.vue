<script setup>
import { ref, computed, defineAsyncComponent, watch } from 'vue'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { useEppChainDrafts } from '@/composables/useEppChainDrafts'
import Tag from 'primevue/tag'
import StatusTag from '@/components/common/StatusTag.vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import SelectButton from 'primevue/selectbutton'
import EppTable from '@/components/epp/EppTable.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import EppRuleDetailView from '@/components/epp/EppRuleDetailView.vue'
import EppChainTabs from '@/components/epp/EppChainTabs.vue'
import EppChainDialog from '@/components/epp/EppChainDialog.vue'
import EppChainDeleteDialog from '@/components/epp/EppChainDeleteDialog.vue'
import EppChainCallers from '@/components/epp/EppChainCallers.vue'
import EppMoveRulesDialog from '@/components/epp/EppMoveRulesDialog.vue'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useQueryClient } from '@tanstack/vue-query'
import { useRoute, useRouter } from 'vue-router'
import {
  useEppChain,
  useEppChains,
  useEppCallGraph,
  useUpdateEppChainRules,
  useCreateEppChain,
  useUpdateEppChain,
  useDeleteEppChain,
  eppKeys,
} from '@/queries/useEppQueries'
import {
  MAIN_CHAIN_ID,
  applyRulePaste,
  canEditChain,
  chainLabel,
  isMainChain,
  resolveChainId,
  sortChains,
} from '@/utils/eppChains'
import { eppChainTarget } from '@/utils/routeTargets'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { useServerActions } from '@/queries/useServerActionQueries'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'
import { useEppClipboardStore } from '@/stores/eppClipboardStore'
import { notifyAction } from '@/utils/notify'

const confirm = useConfirm()
const toast = useToast()
const { can } = usePermissions()

const RF_DISABLED = 0x10
const RF_GENERATE_ALARM = 0x08
const RF_NEGATED_SOURCE = 0x02
const RF_NEGATED_EVENTS = 0x04
const RF_SEVERITY_INFO = 0x100
const RF_SEVERITY_WARNING = 0x200
const RF_SEVERITY_MINOR = 0x400
const RF_SEVERITY_MAJOR = 0x800
const RF_SEVERITY_CRITICAL = 0x1000
const SEVERITY_TERMINATE = 6
const SEVERITY_RESOLVE = 7

// Async so cytoscape is fetched when someone opens the flow, not with Event Processing.
const EppChainFlow = defineAsyncComponent(() => import('@/components/epp/EppChainFlow.vue'))

const VIEW_OPTIONS = [
  {
    value: 'tabs',
    label: 'Rules',
    icon: 'pi pi-list',
    tooltip: 'Edit one chain at a time',
  },
  {
    value: 'flow',
    label: 'Flow',
    icon: 'pi pi-share-alt',
    tooltip: 'See how events travel between chains',
  },
]

const ALARM_SEVERITY_LABELS = ['Normal', 'Warning', 'Minor', 'Major', 'Critical', 'From Event']
// Last label; alarmSeverity 5+ ("from event") clamps to it.
const SEVERITY_FROM_EVENT_INDEX = ALARM_SEVERITY_LABELS.length - 1

const SEVERITY_FLAG_LABELS = [
  { flag: RF_SEVERITY_INFO, label: 'Normal' },
  { flag: RF_SEVERITY_WARNING, label: 'Warning' },
  { flag: RF_SEVERITY_MINOR, label: 'Minor' },
  { flag: RF_SEVERITY_MAJOR, label: 'Major' },
  { flag: RF_SEVERITY_CRITICAL, label: 'Critical' },
]

const { entityId, isDetailView, openDetail, closeDetail } = useEntityDetail()

const editingRule = computed(() => {
  if (!isDetailView.value || entityId.value === 'new') return null
  return localRules.value.find((r) => r.guid === entityId.value) ?? null
})

// Rules, version and dirty state belong to one chain. The active chain rides in `?chain=`, so
// the `:entityId?` rule detail keeps working and a rule URL always names its chain.
const route = useRoute()
const router = useRouter()

const { data: chainsData, isLoading: isLoadingChains } = useEppChains()
const chains = computed(() => sortChains(chainsData.value ?? []))

const activeChainId = computed(() => resolveChainId(route.query.chain, chainsData.value))
const activeChain = computed(
  () => chains.value.find((chain) => chain.id === activeChainId.value) ?? null,
)
const activeChainName = computed(() => chainLabel(activeChain.value))

// In the query so a flow view can be linked to.
const isFlowView = computed(() => route.query.view === 'flow')

function setView(view) {
  router.push({
    name: route.name,
    params: route.params,
    query: { ...route.query, view: view === 'flow' ? 'flow' : undefined },
  })
}

// The call graph lives on the rules, so it means loading every chain; only the rule editor's
// chain-call picker and the flow view need it.
const needsCallGraph = computed(() => isDetailView.value || isFlowView.value)
const {
  callGraph,
  chainsWithRules,
  isLoading: isLoadingCallGraph,
} = useEppCallGraph(chains, { enabled: needsCallGraph })

const chainById = computed(() => new Map(chains.value.map((chain) => [chain.id, chain])))

const chainLabels = computed(
  () => new Map(chains.value.map((chain) => [chain.id, chainLabel(chain)])),
)

/**
 * The WebAPI enforces per-chain access lists, so a chain the user can open is not necessarily
 * one they can save; everything that writes rules is gated on this, not on the global right.
 *
 * No chain on screen is a no: `canEditChain` allows a chain that carries no rights, for older
 * servers, and the list of chains being refused must not read as one of those.
 */
const canEditActiveChain = computed(
  () => activeChain.value !== null && canEditChain(activeChain.value),
)

/** Opening a chain from the flow means leaving the flow for the tabs. */
function onFlowSelectChain(chainId) {
  router.push(eppChainTarget(chainId))
}

const {
  data: chainData,
  isLoading: isLoadingRules,
  isFetching,
  isError,
  error,
  refetch,
} = useEppChain(activeChainId)

const isLoading = computed(() => isLoadingChains.value || isLoadingRules.value)

const { data: eventTemplatesData } = useEventTemplates()
const { data: serverActionsData } = useServerActions()

const eventTemplateMap = computed(() => {
  const map = {}
  for (const t of eventTemplatesData.value ?? []) map[t.code] = t
  return map
})

const serverActionsMap = computed(() => {
  const map = {}
  for (const a of serverActionsData.value ?? []) map[a.id] = a
  return map
})

// One draft per chain, so several chains can be edited before any is written (see
// `useEppChainDrafts` for why each draft's base version is pinned).
const {
  rulesFor,
  versionFor,
  setRules: setDraftRules,
  isDirty: isChainDirty,
  isConflicted: isChainConflicted,
  markConflicted,
  markSaved,
  discard: discardDraft,
  discardAll: discardAllDrafts,
  draftFor,
  dirtyChainIds,
  hasAnyDirty,
  dirtyCount,
} = useEppChainDrafts()

const localRules = computed(() => rulesFor(activeChainId.value, chainData.value?.rules))

const isDirty = computed(() => isChainDirty(activeChainId.value))
const hasConflict = computed(() => isChainConflicted(activeChainId.value))

/**
 * Any chain, not only the one on screen: a cross-chain move writes both. The base version
 * comes from the draft, or else the cached copy, which exists because the chain was opened.
 */
function setChainRules(chainId, rules) {
  const cached = queryClient.getQueryData(eppKeys.chain(chainId))
  setDraftRules(chainId, rules, versionFor(chainId, cached?.version ?? null))
}

/** The single way the active chain's rules change, so dirtiness holds by construction. */
function setRules(rules) {
  setChainRules(activeChainId.value, rules)
}

/** Its draft, or the copy already fetched. */
function currentRulesOf(chainId) {
  const draft = draftFor(chainId)
  if (draft) return draft.rules
  return queryClient.getQueryData(eppKeys.chain(chainId))?.rules ?? null
}

const allSourceIds = computed(() => {
  const ids = new Set()
  for (const rule of localRules.value ?? []) {
    for (const id of rule.sources ?? []) ids.add(id)
  }
  return [...ids]
})
const { objectsById } = useObjectsByIds(allSourceIds)

function sourceName(id) {
  return objectsById.value.get(id)?.name ?? `Object #${id}`
}

// A saved draft is kept until its refetch lands, so the rules on screen never flip back to the
// pre-save copy in the gap.
watch(
  () => chainData.value,
  (data) => {
    const chainId = activeChainId.value
    if (data && draftFor(chainId) && !isChainDirty(chainId)) discardDraft(chainId)
  },
  { immediate: true },
)

const queryClient = useQueryClient()
const { mutateAsync: updateChainRulesAsync, isPending: isSaving } = useUpdateEppChainRules()

const filterState = ref({ text: '', tokens: [] })

useWorkingState('epp', { view: { filterState } })
const isFiltered = computed(() => !!filterState.value.text)

const rulePositionMap = computed(() => {
  const map = {}
  localRules.value.forEach((r, i) => {
    map[r.guid] = i + 1
  })
  return map
})

const filteredRules = computed(() => {
  if (!filterState.value.text) return localRules.value
  const search = filterState.value.text.toLowerCase()
  return localRules.value.filter((r) => (r.comments ?? '').toLowerCase().includes(search))
})

const selectedRuleIds = ref(new Set())
const selectedRulesArray = computed(() =>
  localRules.value.filter((r) => selectedRuleIds.value.has(r.guid)),
)

// In a store: a copy must outlive the chain it was taken from and any remount.
const clipboardStore = useEppClipboardStore()
const clipboard = computed(() => clipboardStore.clipboard)
const cutGuids = computed(() => clipboardStore.cutGuids)

const pasteTooltip = computed(() => {
  if (!clipboard.value) return 'Paste'
  const { rules, chainId, chainName } = clipboard.value
  const what = ruleCount(rules.length)
  if (chainId === activeChainId.value) return `Paste ${what}`
  return `Paste ${what} copied from ${chainName}`
})

function ruleCount(n) {
  return n === 1 ? '1 rule' : `${n} rules`
}

const pendingIds = computed(
  () =>
    new Set(localRules.value.filter((r) => String(r.guid).startsWith('tmp-')).map((r) => r.guid)),
)

const expandedRowIds = ref(new Set())

function isEnabled(rule) {
  return (rule.flags & RF_DISABLED) === 0
}

function alarmActionType(rule) {
  if (!(rule.flags & RF_GENERATE_ALARM)) return null
  if (rule.alarmSeverity === SEVERITY_TERMINATE) return 'terminate'
  if (rule.alarmSeverity === SEVERITY_RESOLVE) return 'resolve'
  return 'generate'
}

function alarmSeverityIndex(rule) {
  return Math.min(rule.alarmSeverity, ALARM_SEVERITY_LABELS.length - 1)
}

function activeSeverityLabels(rule) {
  return SEVERITY_FLAG_LABELS.filter((s) => rule.flags & s.flag).map((s) => s.label)
}

function scriptPreview(script) {
  if (!script) return null
  const first = script.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'))
  const line = first ?? script.split('\n')[0]
  return line.length > 80 ? line.slice(0, 80) + '...' : line
}

/** Marks a rule the server has not seen yet; `ruleForSave` drops it on the way out. */
function newTempGuid() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Output-only fields: `chainId` comes from the request path, `ruleNumber` from array order, and
 * a `tmp-` guid means "new rule, assign one".
 */
function ruleForSave(rule) {
  // eslint-disable-next-line no-unused-vars
  const { chainId: _chainId, ruleNumber: _ruleNumber, errors: _errors, ...rest } = rule
  if (String(rule.guid).startsWith('tmp-')) {
    // eslint-disable-next-line no-unused-vars
    const { guid: _guid, ...withoutGuid } = rest
    return withoutGuid
  }
  return rest
}

/** And whether reloading the chain can fix it. */
function describeSaveFailure(error) {
  if (error?.status === 409) {
    return { kind: 'conflict', message: 'modified by another session', recoverable: true }
  }
  if (error?.status === 403) {
    return {
      kind: 'denied',
      message: 'you no longer have edit rights for this chain',
      recoverable: false,
    }
  }
  return { kind: 'error', message: error?.message ?? 'save failed', recoverable: false }
}

/**
 * Set only when a save did not write everything: `saved` reached the server, `failed` stopped
 * the run, `pending` was never attempted.
 */
const saveReport = ref(null)

/**
 * Stops at the first rejection, as the desktop console does: there is no bulk endpoint, and
 * pushing past a rejection would bury it under later results.
 *
 * @param {number[]} chainIds in the order they should be written
 * @returns {Promise<boolean>} whether every one of them was saved
 */
async function saveChains(chainIds) {
  const saved = []
  let failed = null
  let stoppedAt = chainIds.length

  for (let i = 0; i < chainIds.length; i++) {
    const chainId = chainIds[i]
    const draft = draftFor(chainId)
    if (!draft?.dirty) continue
    try {
      const result = await updateChainRulesAsync({
        chainId,
        version: draft.version ?? undefined,
        rules: draft.rules.map(ruleForSave),
      })
      markSaved(chainId, result.version)
      saved.push({ chainId, warnings: result.warnings ?? null })
    } catch (error) {
      if (error?.status === 409) markConflicted(chainId)
      failed = { chainId, ...describeSaveFailure(error) }
      stoppedAt = i
      break
    }
  }

  clipboardStore.dropCut()
  selectedRuleIds.value = new Set()

  if (!failed) {
    saveReport.value = null
    const warnings = saved.map((entry) => entry.warnings).filter(Boolean)
    const what =
      saved.length === 1
        ? `${chainLabel(chainById.value.get(saved[0].chainId))} chain saved.`
        : `${saved.length} chains saved.`
    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: warnings.length ? `${what} ${warnings.join(' ')}` : what,
      life: warnings.length ? 8000 : 3000,
    })
    return true
  }

  saveReport.value = {
    saved: saved.map((entry) => entry.chainId),
    failed,
    pending: chainIds.slice(stoppedAt + 1).filter((id) => isChainDirty(id)),
  }
  // Land on the chain that stopped the run: the report's actions apply to it.
  if (activeChainId.value !== failed.chainId) goToChain(failed.chainId)
  return false
}

function saveChanges() {
  return saveChains([activeChainId.value])
}

/** In tab order. */
function saveAllChanges() {
  return saveChains(chains.value.map((chain) => chain.id).filter((id) => isChainDirty(id)))
}

function discardChanges() {
  discardDraft(activeChainId.value)
  if (clipboard.value?.chainId === activeChainId.value) clipboardStore.dropCut()
  selectedRuleIds.value = new Set()
  saveReport.value = null
}

function reloadFailedChain() {
  const chainId = saveReport.value?.failed?.chainId
  if (chainId == null) return
  discardDraft(chainId)
  saveReport.value = null
  queryClient.invalidateQueries({ queryKey: eppKeys.chain(chainId) })
  queryClient.invalidateQueries({ queryKey: eppKeys.chains() })
}

function refreshPolicy() {
  if (hasAnyDirty.value) {
    const names = [...dirtyChainIds.value]
      .map((id) => chainLabel(chainById.value.get(id)))
      .join(', ')
    confirm.require({
      header: 'Unsaved Changes',
      message: `Discard unsaved changes to ${names} and reload the policy from the server?`,
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: 'Discard & Reload',
      acceptSeverity: 'danger',
      accept: () => {
        discardAllDrafts()
        saveReport.value = null
        queryClient.invalidateQueries({ queryKey: eppKeys.all() })
      },
    })
  } else {
    refetch()
  }
}

useUnsavedChangesGuard(hasAnyDirty)

// Chain switching is free: every chain keeps its own working copy.
function selectChain(chainId) {
  if (chainId === activeChainId.value) return
  goToChain(chainId)
}

function goToChain(chainId) {
  router.push(eppChainTarget(chainId))
}

// Create, rename and delete are gated on the global EPP right, as in the desktop console.
const showChainDialog = ref(false)
const chainDialogTarget = ref(null) // null when creating
const showChainDeleteDialog = ref(false)
// Not `activeChain`: the delete navigates away, and the dialog must keep naming its chain.
const chainDeleteTarget = ref(null)

const { mutateAsync: createChainAsync, isPending: isCreatingChain } = useCreateEppChain()
const { mutateAsync: updateChainAsync, isPending: isUpdatingChain } = useUpdateEppChain()
const { mutateAsync: deleteChainAsync, isPending: isDeletingChain } = useDeleteEppChain()

const chainMutationError = ref(null)
const isSavingChain = computed(() => isCreatingChain.value || isUpdatingChain.value)

function openNewChain() {
  chainDialogTarget.value = null
  chainMutationError.value = null
  showChainDialog.value = true
}

function openChainProperties() {
  if (!activeChain.value || isMainChain(activeChain.value)) return
  chainDialogTarget.value = activeChain.value
  chainMutationError.value = null
  showChainDialog.value = true
}

async function onChainDialogSave(payload) {
  chainMutationError.value = null
  try {
    if (chainDialogTarget.value) {
      await updateChainAsync({ chainId: chainDialogTarget.value.id, ...payload })
      showChainDialog.value = false
      toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: `Chain "${payload.name}" updated.`,
        life: 3000,
      })
    } else {
      const created = await createChainAsync(payload)
      showChainDialog.value = false
      toast.add({
        severity: 'success',
        summary: 'Created',
        detail: `Chain "${payload.name}" created. Call it from a rule to send events into it.`,
        life: 5000,
      })
      if (created?.id != null) goToChain(created.id)
    }
  } catch (error) {
    chainMutationError.value = error
  }
}

// Moving rules is a local edit of two working copies; Save All writes both in tab order.
const showMoveDialog = ref(false)
const moveError = ref(null)

function openMoveRules() {
  if (!selectedRuleIds.value.size) return
  moveError.value = null
  showMoveDialog.value = true
}

function onMoveConfirm(targetChainId) {
  const moved = selectedRulesArray.value
  if (!moved.length) return
  const targetRules = currentRulesOf(targetChainId)
  if (!targetRules) {
    // Only if the target was never opened: the registry the dialog offers carries no rules.
    moveError.value = new Error(
      `Open the ${chainLabel(chainById.value.get(targetChainId))} chain once before moving rules into it.`,
    )
    return
  }

  const movedGuids = new Set(moved.map((rule) => rule.guid))
  // The target decides `chainId` and `ruleNumber`.
  const arriving = moved.map((rule) => {
    // eslint-disable-next-line no-unused-vars
    const { chainId: _chainId, ruleNumber: _ruleNumber, ...rest } = rule
    return rest
  })
  setChainRules(targetChainId, [...targetRules, ...arriving])
  setRules(localRules.value.filter((rule) => !movedGuids.has(rule.guid)))

  if (clipboard.value?.type === 'cut') clipboardStore.forget(movedGuids)
  selectedRuleIds.value = new Set()
  showMoveDialog.value = false

  const targetName = chainLabel(chainById.value.get(targetChainId))
  toast.add({
    severity: 'success',
    summary: 'Moved',
    detail: `${ruleCount(moved.length)} moved to ${targetName}. Save both chains to apply.`,
    life: 5000,
  })
}

function openChainDelete() {
  if (!activeChain.value || isMainChain(activeChain.value)) return
  chainDeleteTarget.value = activeChain.value
  chainMutationError.value = null
  showChainDeleteDialog.value = true
}

async function onChainDeleteConfirm() {
  const chain = chainDeleteTarget.value
  if (!chain) return
  chainMutationError.value = null
  try {
    const result = await deleteChainAsync(chain.id)
    showChainDeleteDialog.value = false
    discardDraft(chain.id)
    // Only now, so a failed delete keeps the user where they were.
    if (activeChainId.value === chain.id) goToChain(MAIN_CHAIN_ID)
    // Removing the calls bumped the version of every calling chain, so their drafts are behind
    // the server; say so now rather than let a 409 arrive unexplained at the next save.
    for (const updated of result?.updatedChains ?? []) {
      if (isChainDirty(updated.chainId)) markConflicted(updated.chainId)
    }
    const lost = result?.updatedChains?.length ?? 0
    toast.add({
      severity: 'success',
      summary: 'Deleted',
      detail: lost
        ? `Chain "${chain.name}" deleted. Calls to it were removed from ${lost} other ${lost === 1 ? 'chain' : 'chains'}.`
        : `Chain "${chain.name}" deleted.`,
      life: lost ? 6000 : 3000,
    })
  } catch (error) {
    chainMutationError.value = error
  }
}

function onToggleEnabled(rule) {
  const newFlags = rule.flags ^ RF_DISABLED
  const idx = localRules.value.findIndex((r) => r.guid === rule.guid)
  if (idx === -1) return
  setRules([
    ...localRules.value.slice(0, idx),
    { ...localRules.value[idx], flags: newFlags },
    ...localRules.value.slice(idx + 1),
  ])
}

function onSetEnabledBulk(rules, enable) {
  const guidSet = new Set(rules.map((r) => r.guid))
  setRules(
    localRules.value.map((r) => {
      if (!guidSet.has(r.guid)) return r
      const newFlags = enable ? r.flags & ~RF_DISABLED : r.flags | RF_DISABLED
      return { ...r, flags: newFlags }
    }),
  )
}

function onReorder(newRules) {
  setRules(newRules)
}

// Cut and copy change nothing visible, so each names what it took, chain included.
function cutRules(rules) {
  if (!rules.length) return
  clipboardStore.cut(rules, activeChainId.value, activeChainName.value)
  notifyAction(`${ruleCount(rules.length)} cut from ${activeChainName.value}`, 'pi pi-eraser')
}

function copyRules(rules) {
  if (!rules.length) return
  clipboardStore.copy(rules, activeChainId.value, activeChainName.value)
  notifyAction(`${ruleCount(rules.length)} copied from ${activeChainName.value}`, 'pi pi-copy')
}

function cutSelected() {
  cutRules(selectedRulesArray.value)
}

function copySelected() {
  copyRules(selectedRulesArray.value)
}

function pasteAt(insertIndex) {
  if (!clipboard.value) return
  const pastedCount = clipboard.value.rules.length
  const wasCut = clipboard.value.type === 'cut'
  const sourceChainId = clipboard.value.chainId
  const { rules, selection, sourceRules } = applyRulePaste({
    clipboard: clipboard.value,
    rules: localRules.value,
    chainId: activeChainId.value,
    insertIndex,
    makeGuid: newTempGuid,
    // Used only for a cut taken from another chain.
    sourceRules: sourceChainId === activeChainId.value ? null : currentRulesOf(sourceChainId),
  })
  setRules(rules)
  // A cut from another chain empties out of it too; Save All writes both drafts.
  if (sourceRules) setChainRules(sourceChainId, sourceRules)
  selectedRuleIds.value = selection
  // A copy stays on the clipboard, so the same rules can go into several chains.
  if (wasCut) clipboardStore.clear()
  // Not in the server's policy until Save, which is worth saying.
  const where = sourceRules
    ? `moved to ${activeChainName.value} — ${activeChainName.value} and ${chainLabel(chainById.value.get(sourceChainId))} not saved yet`
    : `pasted into ${activeChainName.value} — not saved yet`
  notifyAction(`${ruleCount(pastedCount)} ${where}`, 'pi pi-clipboard')
}

function pasteClipboard() {
  pasteAt(pasteInsertIndex())
}

/** Anchored on the row the menu was opened on, whatever is selected. */
function pasteAfterRule(rule) {
  const idx = localRules.value.findIndex((r) => r.guid === rule.guid)
  pasteAt(idx === -1 ? localRules.value.length : idx + 1)
}

/** After the last selected rule, or at the end. */
function pasteInsertIndex() {
  let last = -1
  localRules.value.forEach((rule, i) => {
    if (selectedRuleIds.value.has(rule.guid)) last = i
  })
  return last === -1 ? localRules.value.length : last + 1
}

function deleteSelected() {
  if (!selectedRuleIds.value.size) return
  const selected = selectedRulesArray.value
  const count = selected.length
  const label = count === 1 ? `"${selected[0].comments || 'unnamed rule'}"` : `${count} rules`
  confirm.require({
    message: `Delete ${label}? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      const deleteGuidSet = new Set(selected.map((r) => r.guid))
      setRules(localRules.value.filter((r) => !deleteGuidSet.has(r.guid)))
      if (clipboard.value?.type === 'cut') clipboardStore.forget(deleteGuidSet)
      selectedRuleIds.value = new Set()
    },
  })
}

const pendingInsertIndex = ref(null)

// Only view state is reset on a chain switch. The clipboard survives: a cut carried into
// another chain is how rules move between them.
watch(activeChainId, () => {
  selectedRuleIds.value = new Set()
  expandedRowIds.value = new Set()
  pendingInsertIndex.value = null
})

function openNewRule() {
  pendingInsertIndex.value = null
  openDetail('new')
}

function openNewRuleAfter(rule) {
  const idx = localRules.value.findIndex((r) => r.guid === rule.guid)
  pendingInsertIndex.value = idx !== -1 ? idx + 1 : null
  openDetail('new')
}

function openNewRuleBefore(rule) {
  const idx = localRules.value.findIndex((r) => r.guid === rule.guid)
  pendingInsertIndex.value = idx !== -1 ? idx : null
  openDetail('new')
}

function editSelected() {
  if (selectedRuleIds.value.size === 1) openDetail([...selectedRuleIds.value][0])
}

function onRuleSaved(savedRule) {
  if (savedRule.guid) {
    const existingIdx = localRules.value.findIndex((r) => r.guid === savedRule.guid)
    if (existingIdx !== -1) {
      setRules([
        ...localRules.value.slice(0, existingIdx),
        { ...localRules.value[existingIdx], ...savedRule },
        ...localRules.value.slice(existingIdx + 1),
      ])
    }
  } else {
    const newRule = { ...savedRule, guid: newTempGuid() }
    const insertAt = pendingInsertIndex.value
    setRules(
      insertAt !== null
        ? [...localRules.value.slice(0, insertAt), newRule, ...localRules.value.slice(insertAt)]
        : [...localRules.value, newRule],
    )
    pendingInsertIndex.value = null
  }
  closeDetail()
}

const contextMenu = ref()

const pasteMenuLabel = computed(() => {
  const count = clipboard.value?.rules.length ?? 0
  return count > 1 ? `Paste ${count} Rules After This Rule` : 'Paste After This Rule'
})

const contextMenuItems = computed(() => {
  const rule = contextMenu.value?.contextData
  if (!rule) return []

  const multiSelected = selectedRuleIds.value.has(rule.guid) && selectedRulesArray.value.length > 1
  const targetRules = multiSelected ? selectedRulesArray.value : [rule]
  const enabling = !isEnabled(rule)
  const toggleLabel = multiSelected
    ? enabling
      ? 'Enable All'
      : 'Disable All'
    : enabling
      ? 'Enable'
      : 'Disable'

  const canEdit = canEditActiveChain.value

  return [
    {
      label: canEdit ? 'Edit' : 'View',
      icon: canEdit ? 'pi pi-pencil' : 'pi pi-eye',
      command: () => openDetail(rule.guid),
    },
    { separator: true },
    {
      label: 'Add Rule Before',
      icon: 'pi pi-arrow-up',
      visible: canEdit,
      command: () => openNewRuleBefore(rule),
    },
    {
      label: 'Add Rule After',
      icon: 'pi pi-arrow-down',
      visible: canEdit,
      command: () => openNewRuleAfter(rule),
    },
    { separator: true },
    {
      // The selection when the clicked rule belongs to it, the clicked rule alone otherwise.
      label: multiSelected ? `Cut ${targetRules.length} Rules` : 'Cut',
      icon: 'pi pi-eraser',
      visible: canEditActiveChain.value,
      command: () => cutRules(targetRules),
    },
    {
      label: multiSelected ? `Copy ${targetRules.length} Rules` : 'Copy',
      icon: 'pi pi-copy',
      command: () => copyRules(targetRules),
    },
    {
      // Hidden rather than disabled: an empty clipboard is the normal state.
      label: pasteMenuLabel.value,
      icon: 'pi pi-clipboard',
      visible: canEditActiveChain.value && !!clipboard.value,
      command: () => pasteAfterRule(rule),
    },
    { separator: true },
    {
      label: toggleLabel,
      icon: enabling ? 'pi pi-check' : 'pi pi-ban',
      visible: canEdit,
      command: () => onSetEnabledBulk(targetRules, enabling),
    },
    {
      label: 'Move to Chain…',
      icon: 'pi pi-arrow-right-arrow-left',
      visible: canEditActiveChain.value && chains.value.length > 1,
      command: () => {
        if (!multiSelected) selectedRuleIds.value = new Set([rule.guid])
        openMoveRules()
      },
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      visible: canEdit,
      command: () => {
        selectedRuleIds.value = new Set([rule.guid])
        deleteSelected()
      },
    },
  ]
})

function onRowContextMenu({ event, rule }) {
  contextMenu.value.show(event, rule)
}

function onMenuClick({ event, rule }) {
  contextMenu.value.show(event, rule)
}
</script>

<template>
  <EppRuleDetailView
    v-if="isDetailView"
    :rule="editingRule"
    :chains="chains"
    :chain-id="activeChainId"
    :call-graph="callGraph"
    :readonly="!canEditActiveChain"
    @close="closeDetail"
    @saved="onRuleSaved"
  />

  <div v-else class="epp-section">
    <SectionHeader title="Event Processing" icon="pi pi-sitemap">
      <template #actions>
        <SelectButton
          :model-value="isFlowView ? 'flow' : 'tabs'"
          :options="VIEW_OPTIONS"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          aria-label="View"
          class="view-switch"
          @update:model-value="setView"
        >
          <template #option="{ option }">
            <i v-tooltip.bottom="option.tooltip" :class="option.icon" />
            <span class="view-switch-label">{{ option.label }}</span>
          </template>
        </SelectButton>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refreshPolicy"
        />
        <template v-if="isDirty">
          <Button
            label="Discard"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            :disabled="isSaving"
            @click="discardChanges"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            size="small"
            severity="primary"
            :loading="isSaving"
            :disabled="isSaving || hasConflict"
            @click="saveChanges"
          />
        </template>
        <!-- With a single dirty chain this would duplicate Save. -->
        <Button
          v-if="dirtyCount > 1"
          :label="`Save All (${dirtyCount})`"
          icon="pi pi-check-circle"
          size="small"
          severity="primary"
          outlined
          :loading="isSaving"
          :disabled="isSaving"
          @click="saveAllChanges"
        />
        <Button
          v-if="canEditActiveChain && !isFlowView"
          label="Add Rule"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openNewRule"
        />
      </template>
    </SectionHeader>

    <EppChainFlow
      v-if="isFlowView"
      :chains="chains"
      :chains-with-rules="chainsWithRules"
      :call-graph="callGraph"
      :loading="isLoadingChains || isLoadingCallGraph"
      :active-chain-id="activeChainId"
      :dirty-chain-ids="dirtyChainIds"
      @select-chain="onFlowSelectChain"
    />

    <template v-else>
      <div class="chain-row">
        <EppChainTabs
          :chains="chains"
          :active-chain-id="activeChainId"
          :dirty-chain-ids="dirtyChainIds"
          :can-manage="can.manageEpp"
          :target-for="(chainId) => eppChainTarget(chainId)"
          @select="selectChain"
          @add="openNewChain"
        />
        <div v-if="can.manageEpp" class="chain-actions">
          <Button
            v-tooltip.bottom="'Chain properties'"
            icon="pi pi-cog"
            size="small"
            severity="secondary"
            text
            rounded
            :disabled="!activeChain || isMainChain(activeChain)"
            aria-label="Chain properties"
            @click="openChainProperties"
          />
          <Button
            v-tooltip.bottom="'Delete chain'"
            icon="pi pi-trash"
            size="small"
            severity="secondary"
            text
            rounded
            :disabled="!activeChain || isMainChain(activeChain)"
            aria-label="Delete chain"
            @click="openChainDelete"
          />
        </div>
      </div>

      <RefetchIndicator :is-fetching="isFetching && !isLoading" />

      <!-- Only when the run stopped early; a full save says so with a toast. -->
      <Message v-if="saveReport" severity="warn" class="save-report" @close="saveReport = null">
        <div class="save-report-body">
          <span class="save-report-lead">
            Saved {{ saveReport.saved.length }} of
            {{ saveReport.saved.length + saveReport.pending.length + 1 }} chains.
          </span>
          <ul class="save-report-list">
            <li v-for="chainId in saveReport.saved" :key="`ok-${chainId}`">
              <i class="pi pi-check save-report-icon save-report-icon--ok" />
              <span class="save-report-chain">{{ chainLabel(chainById.get(chainId)) }}</span>
              <span class="save-report-note">saved</span>
            </li>
            <li>
              <i class="pi pi-exclamation-triangle save-report-icon save-report-icon--bad" />
              <span class="save-report-chain">
                {{ chainLabel(chainById.get(saveReport.failed.chainId)) }}
              </span>
              <span class="save-report-note">{{ saveReport.failed.message }}</span>
            </li>
            <li v-for="chainId in saveReport.pending" :key="`skip-${chainId}`">
              <i class="pi pi-minus save-report-icon" />
              <span class="save-report-chain">{{ chainLabel(chainById.get(chainId)) }}</span>
              <span class="save-report-note">not saved</span>
            </li>
          </ul>
          <div class="save-report-actions">
            <Button
              v-if="saveReport.failed.recoverable"
              label="Reload this chain"
              icon="pi pi-refresh"
              size="small"
              severity="secondary"
              @click="reloadFailedChain"
            />
            <Button
              label="Keep my version"
              icon="pi pi-pencil"
              size="small"
              severity="secondary"
              text
              @click="saveReport = null"
            />
          </div>
        </div>
      </Message>

      <Message v-if="hasConflict" severity="warn" :closable="false" class="conflict-banner">
        The {{ chainLabel(activeChain) }} chain was modified by another session. Reload the latest
        version before saving.
      </Message>

      <!-- The chain's access list grants less than the global EPP right; writing controls are
         hidden rather than disabled. -->
      <Message
        v-else-if="activeChain && !canEditActiveChain"
        severity="secondary"
        :closable="false"
        class="conflict-banner"
      >
        You have read-only access to this chain. Ask an administrator for edit rights to change its
        rules.
      </Message>

      <!-- A chain is only reached through a rule that calls it; one with no callers is dead. -->
      <Message
        v-else-if="activeChain && !isMainChain(activeChain) && !activeChain.callerCount"
        severity="info"
        :closable="false"
        class="conflict-banner"
      >
        No rule calls this chain yet, so no event reaches it. Add a "call chain" action to a rule in
        another chain to send events here.
      </Message>

      <div class="section-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter rules..."
          class="filter-input"
        />
        <span v-if="!isLoading" class="item-count">
          <template v-if="isFiltered">
            {{ filteredRules.length }} of {{ localRules.length }}
          </template>
          <template v-else>
            {{ $plural(localRules.length, 'rule') }}
          </template>
        </span>
        <EppChainCallers
          v-if="can.manageEpp && activeChain?.callerCount"
          :chain="activeChain"
          :chains="chains"
          class="chain-callers-button"
        />
        <div class="toolbar-spacer" />
        <Button
          v-if="canEditActiveChain"
          v-tooltip.bottom="'Edit'"
          icon="pi pi-pencil"
          size="small"
          severity="secondary"
          text
          :disabled="selectedRuleIds.size !== 1"
          aria-label="Edit"
          @click="editSelected"
        />
        <div class="toolbar-divider" />
        <Button
          v-if="canEditActiveChain"
          v-tooltip.bottom="'Cut'"
          icon="pi pi-eraser"
          size="small"
          severity="secondary"
          text
          :disabled="!selectedRuleIds.size"
          aria-label="Cut"
          @click="cutSelected"
        />
        <Button
          v-tooltip.bottom="'Copy'"
          icon="pi pi-copy"
          size="small"
          severity="secondary"
          text
          :disabled="!selectedRuleIds.size"
          aria-label="Copy"
          @click="copySelected"
        />
        <Button
          v-if="canEditActiveChain"
          v-tooltip.bottom="pasteTooltip"
          icon="pi pi-clipboard"
          size="small"
          severity="secondary"
          text
          :disabled="!clipboard"
          aria-label="Paste"
          @click="pasteClipboard"
        />
        <Button
          v-if="canEditActiveChain"
          v-tooltip.bottom="'Move to another chain'"
          icon="pi pi-arrow-right-arrow-left"
          size="small"
          severity="secondary"
          text
          :disabled="!selectedRuleIds.size || chains.length < 2"
          aria-label="Move to another chain"
          @click="openMoveRules"
        />
        <div class="toolbar-divider" />
        <Button
          v-if="canEditActiveChain"
          v-tooltip.bottom="'Delete selected'"
          icon="pi pi-trash"
          size="small"
          severity="secondary"
          text
          :disabled="!selectedRuleIds.size"
          aria-label="Delete selected"
          @click="deleteSelected"
        />
      </div>

      <EppTable
        :rules="filteredRules"
        :loading="isLoading"
        :error="isError ? error : null"
        :selected-ids="selectedRuleIds"
        :expanded-ids="expandedRowIds"
        :cut-ids="cutGuids"
        :pending-ids="pendingIds"
        :can-reorder="canEditActiveChain"
        :can-manage="canEditActiveChain"
        :position-map="rulePositionMap"
        :chain-labels="chainLabels"
        :chain-target-for="(chainId) => eppChainTarget(chainId)"
        @reorder="onReorder"
        @toggle-enabled="onToggleEnabled"
        @selection-change="selectedRuleIds = $event"
        @expansion-change="expandedRowIds = $event"
        @row-contextmenu="onRowContextMenu"
        @menu-click="onMenuClick"
        @retry="refetch"
      >
        <template #expansion="{ rule }">
          <div class="rule-expansion">
            <div class="expansion-panel">
              <div class="expansion-panel-title">Condition</div>

              <div class="expansion-row">
                <span class="expansion-label">Events</span>
                <div class="expansion-chips">
                  <template v-if="rule.events.length">
                    <Tag
                      v-for="code in rule.events"
                      :key="code"
                      severity="secondary"
                      class="expansion-chip"
                      :class="{ 'negated-chip': rule.flags & RF_NEGATED_EVENTS }"
                    >
                      {{ eventTemplateMap[code]?.name ?? `#${code}` }}
                    </Tag>
                  </template>
                  <span v-else class="expansion-muted">any event</span>
                </div>
              </div>

              <div class="expansion-row">
                <span class="expansion-label">Sources</span>
                <div class="expansion-chips">
                  <template v-if="rule.sources.length">
                    <Tag
                      v-for="id in rule.sources"
                      :key="id"
                      severity="secondary"
                      class="expansion-chip"
                      :class="{ 'negated-chip': rule.flags & RF_NEGATED_SOURCE }"
                    >
                      {{ sourceName(id) }}
                    </Tag>
                  </template>
                  <span v-else class="expansion-muted">any object</span>
                </div>
              </div>

              <div class="expansion-row">
                <span class="expansion-label">Severities</span>
                <div class="expansion-chips">
                  <template v-if="activeSeverityLabels(rule).length < 5">
                    <Tag
                      v-for="label in activeSeverityLabels(rule)"
                      :key="label"
                      severity="secondary"
                      class="expansion-chip"
                    >
                      {{ label }}
                    </Tag>
                    <span v-if="!activeSeverityLabels(rule).length" class="expansion-muted">
                      none
                    </span>
                  </template>
                  <span v-else class="expansion-muted">any severity</span>
                </div>
              </div>

              <div v-if="scriptPreview(rule.filterScript)" class="expansion-row">
                <span class="expansion-label">Filter script</span>
                <code class="expansion-code">{{ scriptPreview(rule.filterScript) }}</code>
              </div>
            </div>

            <div class="expansion-panel">
              <div class="expansion-panel-title">Actions</div>

              <div class="expansion-row">
                <span class="expansion-label">Alarm</span>
                <div class="expansion-chips">
                  <template v-if="alarmActionType(rule) === 'generate'">
                    <Tag
                      v-if="alarmSeverityIndex(rule) === SEVERITY_FROM_EVENT_INDEX"
                      value="From Event"
                      severity="secondary"
                      class="expansion-chip"
                    />
                    <StatusTag v-else :status="alarmSeverityIndex(rule)" class="expansion-chip" />
                    <span v-if="rule.alarmMessage" class="expansion-inline-text">
                      {{ rule.alarmMessage }}
                    </span>
                  </template>
                  <template v-else-if="alarmActionType(rule) === 'resolve'">
                    <Tag value="Resolve" severity="success" class="expansion-chip" />
                    <span v-if="rule.alarmKey" class="expansion-inline-text">{{
                      rule.alarmKey
                    }}</span>
                  </template>
                  <template v-else-if="alarmActionType(rule) === 'terminate'">
                    <Tag value="Terminate" severity="secondary" class="expansion-chip" />
                    <span v-if="rule.alarmKey" class="expansion-inline-text">{{
                      rule.alarmKey
                    }}</span>
                  </template>
                  <span v-else class="expansion-muted">none</span>
                </div>
              </div>

              <div v-if="rule.actions.length" class="expansion-row">
                <span class="expansion-label">Execute</span>
                <div class="expansion-chips">
                  <Tag
                    v-for="action in rule.actions"
                    :key="action.id"
                    severity="info"
                    outlined
                    class="expansion-chip"
                  >
                    {{ serverActionsMap[action.id]?.name ?? `Action #${action.id}` }}
                  </Tag>
                </div>
              </div>

              <div v-if="scriptPreview(rule.actionScript)" class="expansion-row">
                <span class="expansion-label">Action script</span>
                <code class="expansion-code">{{ scriptPreview(rule.actionScript) }}</code>
              </div>
            </div>

            <div class="expansion-edit">
              <Button
                :label="canEditActiveChain ? 'Edit Rule' : 'View Rule'"
                icon="pi pi-pencil"
                size="small"
                severity="secondary"
                @click.stop="openDetail(rule.guid)"
              />
            </div>
          </div>
        </template>
      </EppTable>
    </template>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <EppChainDialog
      v-model:visible="showChainDialog"
      :chain="chainDialogTarget"
      :saving="isSavingChain"
      :error="chainMutationError"
      @save="onChainDialogSave"
    />

    <EppMoveRulesDialog
      v-model:visible="showMoveDialog"
      :rules="selectedRulesArray"
      :chains="chains"
      :source-chain-id="activeChainId"
      :error="moveError"
      @confirm="onMoveConfirm"
    />

    <EppChainDeleteDialog
      v-model:visible="showChainDeleteDialog"
      :chain="chainDeleteTarget"
      :chains="chains"
      :deleting="isDeletingChain"
      :error="chainMutationError"
      @confirm="onChainDeleteConfirm"
    />
  </div>
</template>

<style scoped>
.epp-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Chain strip and its management buttons share one row, as in the desktop editor. */
.chain-row {
  display: flex;
  align-items: stretch;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
}

.chain-row > :first-child {
  flex: 1;
  min-width: 0;
  border-bottom: none;
}

.chain-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0 0.5rem;
  flex-shrink: 0;
}

/* One row per chain: the state on the left, what happened on the right. */
.save-report {
  margin: 0.5rem 0.75rem 0;
}

.save-report-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.save-report-lead {
  font-weight: 600;
}

.save-report-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.save-report-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.save-report-icon {
  font-size: 0.75rem;
  width: 1rem;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.save-report-icon--ok {
  color: var(--p-green-500);
}

.save-report-icon--bad {
  color: var(--p-orange-500);
}

.save-report-chain {
  font-weight: 500;
  min-width: 8rem;
}

.save-report-note {
  color: var(--p-text-muted-color);
}

.save-report-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.toolbar-divider {
  width: 1px;
  height: 1.5rem;
  background: var(--p-surface-border);
  margin: 0 0.25rem;
  flex-shrink: 0;
}

.filter-input {
  width: 260px;
}

.toolbar-spacer {
  flex: 1;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  margin-left: 0.75rem;
}

.chain-callers-button {
  margin-left: 0.5rem;
}

.view-switch {
  margin-right: 0.25rem;
}

.view-switch :deep(.p-togglebutton-content) {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.view-switch-label {
  font-size: 0.8125rem;
}

.rule-expansion {
  display: flex;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  background: var(--p-surface-ground);
  align-items: flex-start;
}

.expansion-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.expansion-panel-title {
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.25rem;
}

.expansion-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.expansion-label {
  width: 80px;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
  padding-top: 2px;
}

.expansion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.expansion-chip {
  font-size: 0.75rem;
}

.negated-chip {
  text-decoration: line-through;
  opacity: 0.7;
}

.expansion-muted {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.expansion-inline-text {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}

.expansion-code {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.expansion-edit {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  align-self: center;
}
</style>
