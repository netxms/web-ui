import { dciSource } from '@/utils/dciSource'
import { getDciSourceTypeLabel, getDciStatusInfo } from '@/utils/objectUtils'

/** As legacy DciGroupingMode, in its menu order. */
export const DCI_GROUP_MODES = [
  { value: 'none', label: 'None' },
  { value: 'tag', label: 'Tag' },
  { value: 'origin', label: 'Origin' },
  { value: 'status', label: 'Status' },
  { value: 'template', label: 'Template' },
  { value: 'instanceDiscovery', label: 'Instance discovery' },
  { value: 'relatedObject', label: 'Related object' },
]

/** Modes that read `templateId` / `relatedObject`, which current values carry only on newer servers. */
export const SOURCE_GROUP_MODES = new Set(['template', 'instanceDiscovery', 'relatedObject'])

/** Modes that need the DCI configuration: the instance discovery prototype is looked up there. */
export function needsDciConfig(mode) {
  return mode === 'template' || mode === 'instanceDiscovery'
}

/**
 * @typedef {Object} DciGroupContext
 * @property {number} ownerId - the object the DCIs are on
 * @property {(dciId: number) => object | null} prototype - a DCI configuration on the owner
 * @property {(objectId: number) => string | null} objectName - null when not readable
 */

/** @returns {number} the prototype's id, or 0 for a DCI not made by instance discovery */
function prototypeIdOf(dci, ownerId) {
  const source = dciSource(dci, ownerId)
  return source?.kind === 'instanceDiscovery' ? source.dciId : 0
}

/** Instance DCIs belong to their prototype's template, as in legacy. */
function sourceTemplateId(dci, ctx) {
  const prototypeId = prototypeIdOf(dci, ctx.ownerId)
  if (!prototypeId) return dci.templateId ?? 0
  return ctx.prototype(prototypeId)?.templateId ?? 0
}

function group(mode, value, label, objectId = null) {
  return { key: `${mode}:${value}`, label, last: false, objectId }
}

/** Holds the DCIs without a value for the grouping attribute; sorted after the others. */
function fallback(mode, label) {
  return { key: mode, label, last: true, objectId: null }
}

function objectGroup(mode, objectId, ctx) {
  return group(mode, objectId, ctx.objectName(objectId) ?? `[${objectId}]`, objectId)
}

/**
 * Which group a DCI belongs to, after legacy DciGroupingContentProvider. Takes both current-value
 * rows and configuration documents.
 *
 * @param {object} dci
 * @param {string} mode - a DCI_GROUP_MODES value other than `none`
 * @param {DciGroupContext} ctx
 * @returns {{ key: string, label: string, last: boolean, objectId: number | null }} keys carry
 *   the mode, so groups of different modes never share one
 */
export function dciGroupOf(dci, mode, ctx) {
  switch (mode) {
    case 'tag':
      return dci.userTag ? group(mode, dci.userTag, dci.userTag) : fallback(mode, '(untagged)')
    case 'origin': {
      const label = getDciSourceTypeLabel(dci.sourceType ?? dci.origin)
      return group(mode, label, label)
    }
    case 'status': {
      const info = getDciStatusInfo(dci.status)
      return group(mode, info.id, info.label)
    }
    case 'template': {
      const templateId = sourceTemplateId(dci, ctx)
      return templateId ? objectGroup(mode, templateId, ctx) : fallback(mode, '(no template)')
    }
    case 'instanceDiscovery': {
      const prototypeId = prototypeIdOf(dci, ctx.ownerId)
      if (!prototypeId) return fallback(mode, '(no instance discovery)')
      const prototype = ctx.prototype(prototypeId)
      return group(
        mode,
        prototypeId,
        prototype?.description || prototype?.name || `[${prototypeId}]`,
      )
    }
    case 'relatedObject':
      return dci.relatedObject
        ? objectGroup(mode, dci.relatedObject, ctx)
        : fallback(mode, '(no related object)')
    default:
      throw new Error(`Unexpected DCI grouping mode ${mode}`)
  }
}

/**
 * Objects whose names the groups show.
 *
 * @param {object[]} dcis
 * @param {string} mode
 * @param {DciGroupContext} ctx
 * @returns {number[]}
 */
export function dciGroupObjectIds(dcis, mode, ctx) {
  const ids = new Set()
  for (const dci of dcis) {
    const id =
      mode === 'template'
        ? sourceTemplateId(dci, ctx)
        : mode === 'relatedObject'
          ? dci.relatedObject
          : 0
    if (id) ids.add(id)
  }
  return [...ids]
}
