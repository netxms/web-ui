import objectActions from './objectActions'
import templateActions from './templateActions'

/**
 * Action sets keyed by domain, each an array of extended PrimeVue MenuItems. There is no `dci`
 * domain: DCIsView builds its own context menu from the DCI config mutations it holds.
 */
const ACTION_SETS = {
  object: objectActions,
  template: templateActions,
}

export const actionRegistry = {
  /**
   * @param {string[]} [domains] - all domains when omitted
   * @returns {import('primevue/menuitem').MenuItem[]}
   */
  getActions(domains) {
    const sets = domains
      ? domains.filter((d) => ACTION_SETS[d]).map((d) => ACTION_SETS[d])
      : Object.values(ACTION_SETS)
    return sets.flat()
  },
}
