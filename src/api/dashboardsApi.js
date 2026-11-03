import { getObject, getObjectSubTree, updateObjectDashboardContent } from './objectsApi'
import { adaptApiDashboard, serializeDashboard } from '@/utils/dashboardAdapters'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'
import {
  DEMO_GROUP_ID,
  isDemoDashboardId,
  listDemoDashboards,
  getDemoDashboard,
  saveDemoDashboard,
} from './demoDashboardStorage'

export function getDashboardTree() {
  return getObjectSubTree(7).then((tree) => {
    if (!DEMO_CONTENT_ENABLED) return tree
    const demoGroup = {
      id: DEMO_GROUP_ID,
      class: 'DashboardGroup',
      name: 'Demo Dashboards',
      status: 0,
      children: listDemoDashboards(),
    }
    return [...tree, demoGroup]
  })
}

export function getDashboard(id) {
  // Demo membership is exact (store lookup), so real dashboards always fall
  // through to the server regardless of their id.
  if (isDemoDashboardId(id)) {
    return Promise.resolve(adaptApiDashboard(getDemoDashboard(id)))
  }
  return getObject(id).then((apiObj) => adaptApiDashboard(apiObj))
}

/**
 * Demo dashboards persist to localStorage; real ones go to PUT /v1/objects/{id}/dashboard.
 * Everything but numColumns and elements is sent only when the caller passed it: the server keeps
 * absent keys, while serializeDashboard would default `scrollable` to false. The object-context
 * flags also need `objectContextFlagsSupported` (an older server drops them silently).
 * rowHeight and aiHint are UI-local.
 * @param {number} id
 * @param {object} data - internal dashboard shape { name?, cols, rowHeight?,
 *   scrollable?, displayPriority?, showAsObjectView?, showContextSelector?,
 *   objectContextFlagsSupported?, widgets, aiHint? } (partial fields are preserved from
 *   the stored dashboard)
 */
export function saveDashboard(id, data) {
  if (isDemoDashboardId(id)) {
    const serialized = serializeDashboard({ ...data, id: Number(id) })
    return Promise.resolve(saveDemoDashboard(id, serialized))
  }
  const { numColumns, elements } = serializeDashboard({ ...data, id: Number(id) })
  const content = { numColumns, elements }
  if (typeof data.scrollable === 'boolean') content.scrollable = data.scrollable
  if (typeof data.displayPriority === 'number') content.displayPriority = data.displayPriority
  if (data.objectContextFlagsSupported === true) {
    if (typeof data.showAsObjectView === 'boolean') {
      content.showAsObjectView = data.showAsObjectView
    }
    if (typeof data.showContextSelector === 'boolean') {
      content.showContextSelector = data.showContextSelector
    }
  }
  return updateObjectDashboardContent(id, content).then(adaptApiDashboard)
}
