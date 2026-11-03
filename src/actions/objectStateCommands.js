/** Object state mutations shared by the action sets. */
import { setObjectManaged, updateObjectProperties } from '@/api/objectsApi'
import { queryClient } from '@/queries/config'
import { objectKeys } from '@/queries/useObjectQueries'
import { notify } from '@/utils/notify'

/**
 * Re-read what shows an object's state: its own document, the trees, and the child lists
 * (a node's Interfaces table is one).
 */
function invalidateObjectState(objects) {
  for (const object of objects) {
    queryClient.invalidateQueries({ queryKey: objectKeys.detail(object.id) })
  }
  queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
  queryClient.invalidateQueries({ queryKey: ['objects', 'children'] })
}

/**
 * Reported through `app:objectManagedChanged`: App.vue owns the wording.
 *
 * @param {{ id: number, name: string }} object
 * @param {boolean} managed
 */
async function setObjectManagedState(object, managed) {
  try {
    await setObjectManaged(object.id, managed)
    invalidateObjectState([object])
    window.dispatchEvent(
      new CustomEvent('app:objectManagedChanged', {
        detail: { name: object.name, managed, success: true },
      }),
    )
  } catch {
    window.dispatchEvent(
      new CustomEvent('app:objectManagedChanged', {
        detail: { name: object.name, managed, success: false },
      }),
    )
  }
}

/**
 * Sequential: each call invalidates the same subtree query and the listener toasts per object,
 * so parallel calls only interleave.
 *
 * @param {Array<{ id: number, name: string }>} objects
 * @param {boolean} managed
 */
export async function setObjectManagedStateFor(objects, managed) {
  for (const object of objects) {
    await setObjectManagedState(object, managed)
  }
}

/**
 * Legacy "Change interface expected state...". Settled one by one, like maintenance: a refusal
 * on one interface must not hide the ones that did change.
 *
 * @param {Array<{ id: number, name: string }>} interfaces
 * @param {number} state - `EXPECTED_STATE` value
 * @param {string} label - the state's display name, for the toast
 */
export async function setInterfaceExpectedStateFor(interfaces, state, label) {
  const results = await Promise.allSettled(
    interfaces.map((iface) => updateObjectProperties(iface.id, { expectedState: state })),
  )
  const changed = interfaces.filter((_, index) => results[index].status === 'fulfilled')
  if (changed.length > 0) {
    invalidateObjectState(changed)
    notify({
      summary: `Expected state set to ${label}`,
      detail: changed.length === 1 ? changed[0].name : `${changed.length} interfaces`,
    })
  }

  // 403 is already toasted by api/client.js; anything else needs saying here.
  const failed = interfaces.filter(
    (_, index) => results[index].status === 'rejected' && results[index].reason?.status !== 403,
  )
  if (failed.length > 0) {
    notify({
      severity: 'error',
      summary:
        failed.length === 1
          ? 'Could not change expected state'
          : `Could not change expected state of ${failed.length} interfaces`,
      detail: failed.map((iface) => iface.name).join(', '),
      life: 5000,
    })
  }
}
