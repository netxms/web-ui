import { DCF_TEMPLATE_OVERRIDE } from '@/composables/useDciFlags'

/**
 * First hop of a DCI's origin, after the legacy client's rules: `templateId` equal to the
 * owner means instance discovery from prototype `templateItemId` on the same object; any other
 * non-zero `templateId` is the template (or cluster) that added it.
 *
 * @param {{ templateId?: number, templateItemId?: number, flags?: number } | null} dci -
 *   a DCI configuration document
 * @param {number} ownerId - the object the DCI is on
 * @returns {{ kind: 'instanceDiscovery' | 'object', objectId: number, dciId: number,
 *   isProtected: boolean } | null} null for a DCI created here
 */
export function dciSource(dci, ownerId) {
  const templateId = dci?.templateId ?? 0
  if (!templateId) return null
  return {
    kind: templateId === ownerId ? 'instanceDiscovery' : 'object',
    objectId: templateId,
    dciId: dci.templateItemId ?? 0,
    isProtected: ((dci.flags ?? 0) & DCF_TEMPLATE_OVERRIDE) !== 0,
  }
}

/**
 * Current-values rows carry only `templateItemId`, which the server sets together with
 * `templateId`. Instance-discovered DCIs count as template items, as in legacy.
 *
 * @param {{ templateId?: number, templateItemId?: number }} dci
 * @returns {boolean}
 */
export function isTemplateItem(dci) {
  return (dci?.templateId ?? 0) !== 0 || (dci?.templateItemId ?? 0) !== 0
}

/** As in legacy DataCollectionView.navigateToSource. */
const MAX_SOURCE_HOPS = 8

/**
 * Where an edit to a generated DCI lasts: the far end of the chain it was copied along (each
 * copy is overwritten from the one before it), as legacy's "Edit Source" resolves it. Stops at
 * a template, a DCI created where it is, anything unreadable, or after MAX_SOURCE_HOPS.
 *
 * @param {object} dci - the edited DCI's configuration
 * @param {{ id: number }} owner - the object it is on
 * @param {{ getDci: (objectId: number, dciId: number) => Promise<object>,
 *   getObject: (objectId: number) => Promise<object> }} api
 * @returns {Promise<{ objectId: number, dciId: number, object: object | null,
 *   prototype: object | null } | null>} null for a DCI created on its own object. `object` is
 *   null when the last object reached could not be read; `prototype` is the instance
 *   discovery prototype on the owner, when there is one
 */
export async function resolveDciSourceRoot(dci, owner, { getDci, getObject }) {
  const source = dciSource(dci, owner.id)
  if (!source) return null

  const fetchDci = (objectId, dciId) => getDci(objectId, dciId).catch(() => null)
  let objectId = source.objectId
  let dciId = source.dciId
  let prototype = null

  if (source.kind === 'instanceDiscovery') {
    prototype = await fetchDci(owner.id, dciId)
    // A prototype created on this object is the end of the chain.
    if (!prototype?.templateId) return { objectId, dciId, object: owner, prototype }
    objectId = prototype.templateId
    dciId = prototype.templateItemId
  }

  let object
  for (let hop = 0; ; hop++) {
    object = await getObject(objectId).catch(() => null)
    if (!object || object.class === 'Template' || hop === MAX_SOURCE_HOPS) break
    const next = await fetchDci(objectId, dciId)
    if (!next?.templateId) break
    objectId = next.templateId
    dciId = next.templateItemId
  }
  return { objectId, dciId, object, prototype }
}
