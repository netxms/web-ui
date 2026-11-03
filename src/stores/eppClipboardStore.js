import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

/**
 * Held outside the section so a copy survives remounts and can be pasted into another chain.
 * The rules are a snapshot taken at copy time.
 */
export const useEppClipboardStore = defineStore('eppClipboard', () => {
  const authStore = useAuthStore()

  /** `{ type: 'copy'|'cut', rules: object[], chainId: number, chainName: string }` or null. */
  const clipboard = ref(null)

  const isEmpty = computed(() => !clipboard.value)

  /** Guids of rules waiting to be moved, shown struck through. */
  const cutGuids = computed(() => {
    if (clipboard.value?.type !== 'cut') return new Set()
    return new Set(clipboard.value.rules.map((rule) => rule.guid))
  })

  function copy(rules, chainId, chainName) {
    clipboard.value = { type: 'copy', rules: [...rules], chainId, chainName }
  }

  function cut(rules, chainId, chainName) {
    clipboard.value = { type: 'cut', rules: [...rules], chainId, chainName }
  }

  function clear() {
    clipboard.value = null
  }

  /**
   * A cut is chain-local (the chain saves as a whole), so ending the editing session drops it;
   * a copy is kept.
   */
  function dropCut() {
    if (clipboard.value?.type === 'cut') clear()
  }

  /** Drop the rules a delete removed, so a cut cannot resurrect them on paste. */
  function forget(guids) {
    if (!clipboard.value) return
    const rules = clipboard.value.rules.filter((rule) => !guids.has(rule.guid))
    clipboard.value = rules.length ? { ...clipboard.value, rules } : null
  }

  // The store outlives a sign-out, and the rules carry what the previous account could read.
  watch(
    () => authStore.sessionGuid,
    () => clear(),
  )

  return { clipboard, isEmpty, cutGuids, copy, cut, clear, dropCut, forget }
})
