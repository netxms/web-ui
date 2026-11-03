import { computed } from 'vue'
import { actionRegistry } from '@/actions'
import { hasObjectRight } from '@/auth/objectAccessRights'

/**
 * @param {import('vue').Ref<object|null>} contextRef - ActionContext
 *   ({ object, viewContext, selection? })
 * @param {object} [options]
 * @param {string[]} [options.domains] - e.g. ['object']
 * @param {number} [options.maxPrimary=2] - promoted actions for the header toolbar
 * @returns {{ menuItems: import('vue').ComputedRef, primaryActions: import('vue').ComputedRef }}
 */
export function useActions(contextRef, options = {}) {
  const { domains, maxPrimary = 2 } = options

  const menuItems = computed(() => {
    const ctx = contextRef.value
    if (!ctx?.object) return []

    const rawActions = actionRegistry.getActions(domains)
    return resolveActions(rawActions, ctx)
  })

  const primaryActions = computed(() => {
    return extractPrimaryActions(menuItems.value, maxPrimary)
  })

  return { menuItems, primaryActions }
}

export function resolveActions(actions, ctx) {
  const applicable = actions
    .filter((action) => isActionVisible(action, ctx))
    .map((action) => resolveAction(action, ctx))
    .filter((action) => action.visible !== false)

  return insertGroupSeparators(sortByGroupAndPriority(applicable))
}

function isActionVisible(action, ctx) {
  // Single-object actions are hidden for a range selection (the legacy `singleObject` gate).
  const selection = ctx.selection
  const targets = selection?.length > 1 ? selection : [ctx.object]

  if (targets.length > 1 && !action.multiSelect) return false

  if (
    action.objectClasses &&
    !targets.every((object) => action.objectClasses.includes(object?.class))
  ) {
    return false
  }

  // Missing rights hide the item rather than disabling it, as in the legacy client.
  // effectiveRights are permissive when the server did not send them.
  if (
    action.requiredObjectRight &&
    !targets.every((object) => hasObjectRight(object, action.requiredObjectRight))
  ) {
    return false
  }

  // Once with the whole context, not per object: several predicates read `ctx.selection`
  // with "any" semantics, which per-object evaluation would flip to "all".
  if (action.isApplicable && !action.isApplicable(ctx)) return false

  return true
}

function resolveAction(action, ctx) {
  const resolved = { ...action }

  if (action.isDisabled) {
    resolved.disabled = action.isDisabled(ctx)
  }

  if (action.command) {
    const originalCommand = action.command
    resolved.command = (event) => {
      event.actionContext = ctx
      originalCommand(event)
    }
  }

  if (action.items) {
    const children = typeof action.items === 'function' ? action.items(ctx) : action.items
    resolved.items = resolveActions(children, ctx)
    // `dynamic` submenus get their children at render time (server-defined object tools).
    if (!action.dynamic && resolved.items.filter((i) => !i.separator).length === 0) {
      resolved.visible = false
    }
  }

  return resolved
}

/** Groups in the order first declared, then by priority within the group. */
function sortByGroupAndPriority(actions) {
  const groupOrder = new Map()
  for (const action of actions) {
    const group = action.group ?? ''
    if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size)
  }

  return [...actions].sort((a, b) => {
    const groupDelta = groupOrder.get(a.group ?? '') - groupOrder.get(b.group ?? '')
    if (groupDelta !== 0) return groupDelta
    return (a.priority ?? 100) - (b.priority ?? 100)
  })
}

function insertGroupSeparators(actions) {
  const result = []
  let lastGroup = null

  for (const action of actions) {
    if (action.group && lastGroup && action.group !== lastGroup) {
      result.push({ separator: true })
    }
    result.push(action)
    if (action.group) lastGroup = action.group
  }

  return result
}

export function extractPrimaryActions(items, max) {
  const promoted = items.filter(
    (item) => !item.separator && item.primary && !item.disabled && item.visible !== false,
  )

  promoted.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))
  return promoted.slice(0, max)
}

/**
 * Runnable leaves of a resolved menu, each with its submenu path ("Poll > Status").
 *
 * @param {Array} items
 * @param {string[]} [path]
 * @returns {Array<{ id, label, path: string[], pathLabel: string, icon, command }>}
 */
export function flattenActions(items, path = []) {
  const leaves = []

  for (const item of items) {
    if (item.separator || item.disabled || item.visible === false) continue

    if (item.items?.length) {
      leaves.push(...flattenActions(item.items, [...path, item.label]))
    } else if (item.command) {
      leaves.push({
        id: item.id,
        label: item.label,
        icon: item.icon,
        path,
        pathLabel: [...path, item.label].join(' > '),
        command: item.command,
      })
    }
  }

  return leaves
}
