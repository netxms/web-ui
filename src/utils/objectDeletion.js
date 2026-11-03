import { DCI_TARGET_CLASSES } from '@/utils/objectUtils'

/**
 * Whether deleting these objects needs legacy's "what happens to the DCIs" question. A template
 * wins over a cluster. A cluster with unknown children is treated as having members.
 *
 * @param {Array<{ class: string, name: string, children?: Array<{ class?: string }> }>} objects
 * @returns {{ kind: 'template'|'cluster', name: string } | null}
 */
export function dciChoiceFor(objects) {
  const nameFor = (matching, plural) => (objects.length === 1 ? matching[0].name : plural)
  const templates = objects.filter((o) => o.class === 'Template')
  if (templates.length > 0) {
    return { kind: 'template', name: nameFor(templates, 'multiple templates') }
  }
  const clusters = objects.filter((o) => o.class === 'Cluster' && clusterHasMembers(o))
  if (clusters.length > 0) {
    return { kind: 'cluster', name: nameFor(clusters, 'multiple clusters') }
  }
  return null
}

function clusterHasMembers(cluster) {
  const children = cluster.children
  if (!Array.isArray(children) || children.some((c) => !c?.class)) return true
  return children.some((c) => DCI_TARGET_CLASSES.has(c.class) && c.class !== 'Template')
}
