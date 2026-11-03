import { computed, ref } from 'vue'

/**
 * Unsaved edits to event processing rule chains, one working copy per chain (the server saves
 * one chain per request). View-scoped, not a store: a store would outlive a sign-out.
 *
 * A draft pins the `version` it was created from and never re-reads it, so a background
 * refetch cannot rebase the edit and the server's 409 at save time stays meaningful.
 *
 * @typedef {object} ChainDraft
 * @property {object[]} rules in evaluation order
 * @property {number|null} version chain version the draft was taken from
 * @property {boolean} dirty
 * @property {boolean} conflict a save was rejected and a reload is required
 */
export function useEppChainDrafts() {
  /** @type {import('vue').Ref<Map<number, ChainDraft>>} */
  const drafts = ref(new Map())

  // Replace the Map rather than mutating it, so computeds reading it are invalidated.
  function write(chainId, entry) {
    const next = new Map(drafts.value)
    next.set(chainId, entry)
    drafts.value = next
  }

  function draftFor(chainId) {
    return drafts.value.get(chainId)
  }

  function rulesFor(chainId, serverRules) {
    return drafts.value.get(chainId)?.rules ?? serverRules ?? []
  }

  function versionFor(chainId, serverVersion) {
    const draft = drafts.value.get(chainId)
    return draft ? draft.version : (serverVersion ?? null)
  }

  /** The first edit pins `baseVersion`; later edits leave it alone. */
  function setRules(chainId, rules, baseVersion = null) {
    const existing = drafts.value.get(chainId)
    write(chainId, {
      rules,
      version: existing ? existing.version : baseVersion,
      dirty: true,
      conflict: existing?.conflict ?? false,
    })
  }

  function isDirty(chainId) {
    return drafts.value.get(chainId)?.dirty === true
  }

  function isConflicted(chainId) {
    return drafts.value.get(chainId)?.conflict === true
  }

  /** Keeps the rules; saving stays blocked until reload, since a retry can only fail again. */
  function markConflicted(chainId) {
    const existing = drafts.value.get(chainId)
    if (!existing) return
    write(chainId, { ...existing, conflict: true })
  }

  // The draft survives, clean, so the rules do not flip back to the pre-save copy until the
  // refetch lands; the section drops it then.
  function markSaved(chainId, version) {
    const existing = drafts.value.get(chainId)
    if (!existing) return
    write(chainId, {
      ...existing,
      version: version ?? existing.version,
      dirty: false,
      conflict: false,
    })
  }

  function discard(chainId) {
    if (!drafts.value.has(chainId)) return
    const next = new Map(drafts.value)
    next.delete(chainId)
    drafts.value = next
  }

  function discardAll() {
    if (drafts.value.size === 0) return
    drafts.value = new Map()
  }

  const dirtyChainIds = computed(() => {
    const ids = new Set()
    for (const [chainId, draft] of drafts.value) {
      if (draft.dirty) ids.add(chainId)
    }
    return ids
  })

  const hasAnyDirty = computed(() => dirtyChainIds.value.size > 0)
  const dirtyCount = computed(() => dirtyChainIds.value.size)

  return {
    drafts,
    draftFor,
    rulesFor,
    versionFor,
    setRules,
    isDirty,
    isConflicted,
    markConflicted,
    markSaved,
    discard,
    discardAll,
    dirtyChainIds,
    hasAnyDirty,
    dirtyCount,
  }
}
