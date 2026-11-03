/**
 * Cards enterprise modules add to the group overview (ContainerOverviewView), declared as
 * `{ id, objectClasses, component }` in a manifest's `overviewCards`. The registry decides which
 * cards may apply; the card renders nothing when it has nothing to say. Cards render after the
 * core cards, so a late one never pushes them down.
 */
import { defineAsyncComponent } from 'vue'
import { moduleRegistry, MODULE_STATE } from '@/modules'

export const GROUP_OVERVIEW_CLASSES = ['Container', 'Collector', 'ServiceRoot', 'Network']

/**
 * Also run by every module's manifest spec.
 *
 * @param {Array<{ id: string, moduleId: string, objectClasses?: string[], component?: Function }>} cards
 */
export function validateModuleOverviewCards(cards) {
  for (const card of cards) {
    if (typeof card.component !== 'function') {
      throw new Error(`Module "${card.moduleId}" overview card "${card.id}" has no component`)
    }
    const classes = card.objectClasses ?? []
    if (!classes.length || classes.some((cls) => !GROUP_OVERVIEW_CLASSES.includes(cls))) {
      throw new Error(
        `Module "${card.moduleId}" overview card "${card.id}" must name classes from ` +
          GROUP_OVERVIEW_CLASSES.join(', '),
      )
    }
  }
}

validateModuleOverviewCards(moduleRegistry.overviewCards)

// One async wrapper per card for the app's lifetime, so re-renders never reload it.
const CARDS = moduleRegistry.overviewCards.map((card) => ({
  ...card,
  view: defineAsyncComponent(card.component),
}))

/**
 * Reactive through the module registry, so call it inside a `computed`.
 *
 * @param {string|null|undefined} objectClass
 */
export function getOverviewCards(objectClass) {
  return CARDS.filter(
    (card) =>
      card.objectClasses.includes(objectClass) &&
      moduleRegistry.getModuleState(card.moduleId) === MODULE_STATE.ACTIVE,
  )
}
