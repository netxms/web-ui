/**
 * Enterprise modules: the only entry point core code may import. A manifest is
 *   { id, label, requiredComponent, objectViews?, overviewCards? }
 * A module is active while the server reports its `requiredComponent` or `VITE_FORCE_MODULES`
 * names it. The override stays in this registry: `useServerComponents().has()` must never fake
 * AI-ASSISTANT.
 */
import { shallowRef, watch } from 'vue'
import compiledModules from 'virtual:netxms-modules'
import { useServerComponents } from '@/composables/useServerComponents'
import { parseModuleList } from './parseModuleList'

export const MODULE_STATE = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  UNKNOWN: 'unknown',
})

/**
 * @param {Array<{ id: string, requiredComponent: string, objectViews?: Array<object>,
 *   overviewCards?: Array<object> }>} manifests
 * @param {{ forced?: string[] }} [options] - module ids to treat as present on any server
 */
export function createModuleRegistry(manifests, { forced = [] } = {}) {
  const byId = new Map()
  for (const manifest of manifests) {
    if (!manifest?.id || typeof manifest.requiredComponent !== 'string') {
      throw new Error(
        `Module manifest "${manifest?.id ?? '?'}" needs an id and a requiredComponent`,
      )
    }
    if (byId.has(manifest.id)) throw new Error(`Duplicate module id "${manifest.id}"`)
    byId.set(manifest.id, manifest)
  }

  const objectViews = []
  const viewIds = new Set()
  for (const manifest of manifests) {
    for (const view of manifest.objectViews ?? []) {
      if (viewIds.has(view.id)) {
        throw new Error(`Object view id "${view.id}" is declared by more than one module`)
      }
      viewIds.add(view.id)
      objectViews.push({ ...view, moduleId: manifest.id })
    }
  }

  const overviewCards = []
  const cardIds = new Set()
  for (const manifest of manifests) {
    for (const card of manifest.overviewCards ?? []) {
      if (cardIds.has(card.id)) {
        throw new Error(`Overview card id "${card.id}" is declared by more than one module`)
      }
      cardIds.add(card.id)
      overviewCards.push({ ...card, moduleId: manifest.id })
    }
  }

  const forcedIds = new Set(forced.filter((id) => byId.has(id)))
  const ignoredForced = forced.filter((id) => !byId.has(id))

  const serverComponents = shallowRef(null)

  /** @param {string[]|null} list - `server-info.components`, or null for "not known yet" */
  function setServerComponents(list) {
    serverComponents.value = Array.isArray(list) ? [...list] : null
  }

  /**
   * @param {string} id
   * @returns {'active'|'inactive'|'unknown'}
   */
  function getModuleState(id) {
    const manifest = byId.get(id)
    if (!manifest) return MODULE_STATE.INACTIVE
    if (forcedIds.has(id)) return MODULE_STATE.ACTIVE
    const list = serverComponents.value
    if (list === null) return MODULE_STATE.UNKNOWN
    return list.includes(manifest.requiredComponent) ? MODULE_STATE.ACTIVE : MODULE_STATE.INACTIVE
  }

  return {
    modules: Object.freeze([...manifests]),
    objectViews: Object.freeze(objectViews),
    overviewCards: Object.freeze(overviewCards),
    ignoredForced,
    setServerComponents,
    getModuleState,
  }
}

export const moduleRegistry = createModuleRegistry(compiledModules, {
  forced: parseModuleList(import.meta.env.VITE_FORCE_MODULES),
})

if (import.meta.env.DEV && import.meta.env.MODE !== 'test' && moduleRegistry.ignoredForced.length) {
  console.warn(
    `VITE_FORCE_MODULES names modules this build does not contain: ${moduleRegistry.ignoredForced.join(', ')}`,
  )
}

/**
 * Unknown while the request is in flight; a failed request or an old server reads as inactive.
 *
 * @param {ReturnType<typeof createModuleRegistry>} [registry]
 */
export function useModuleRuntime(registry = moduleRegistry) {
  const { components, isLoading } = useServerComponents()
  watch(
    [components, isLoading],
    ([list, loading]) => registry.setServerComponents(loading ? null : list),
    { immediate: true },
  )
}
