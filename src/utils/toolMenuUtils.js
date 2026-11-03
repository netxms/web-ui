/**
 * Tool names use "->" as path separator and "&" as accelerator markers:
 *   "&Info->&Agent->&Loaded subagents"  ->  Info > Agent > Loaded subagents
 *
 * `iconImage` is the tool's library image guid; the type icon shows until it loads.
 *
 * @param {Array} tools - flat tool definitions from the API
 * @param {(tool: object) => void} onExecute
 * @param {{ iconFor?: (tool: object) => string|null }} [options]
 * @returns {Array} PrimeVue MenuItem tree
 */
export function buildToolMenuTree(tools, onExecute, { iconFor } = {}) {
  if (!tools?.length) return []

  const root = { children: new Map() }

  for (const tool of tools) {
    // The command type cannot be launched from a web browser.
    if (!tool.name || tool.disabled || tool.type === 'command') continue

    const segments = tool.name.split('->').map((s) => s.replace(/&/g, '').trim())
    let node = root

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (!node.children.has(segment)) {
        node.children.set(segment, { label: segment, children: new Map() })
      }
      node = node.children.get(segment)
    }

    const leafLabel = segments[segments.length - 1]
    node.children.set(`${leafLabel}__${tool.id}`, {
      label: leafLabel,
      tool,
    })
  }

  return mapToMenuItems(root.children, onExecute, iconFor)
}

function mapToMenuItems(childrenMap, onExecute, iconFor) {
  const items = []

  for (const node of childrenMap.values()) {
    if (node.tool) {
      items.push({
        id: `object.tool.${node.tool.id}`,
        label: node.label,
        icon: getToolTypeIcon(node.tool.type),
        iconImage: iconFor?.(node.tool) ?? null,
        command: () => onExecute(node.tool),
      })
    } else {
      const subItems = mapToMenuItems(node.children, onExecute, iconFor)
      if (subItems.length > 0) {
        items.push({
          label: node.label,
          items: subItems,
        })
      }
    }
  }

  // Branches first, then leaves, each sorted by label.
  items.sort((a, b) => {
    const aIsBranch = !!a.items
    const bIsBranch = !!b.items
    if (aIsBranch !== bIsBranch) return aIsBranch ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  return items
}

export function getToolTypeIcon(toolType) {
  switch (toolType) {
    case 'server-script':
    case 'server-command':
    case 'action':
    case 'ssh-command':
      return 'pi pi-terminal'
    case 'snmp-table':
    case 'agent-table':
    case 'agent-list':
      return 'pi pi-table'
    case 'url':
      return 'pi pi-external-link'
    case 'file-download':
      return 'pi pi-download'
    default:
      return 'pi pi-wrench'
  }
}

/**
 * Loading spinner, the "Create a tool..." link when empty, or the tool tree.
 *
 * @param {object[]|undefined} tools - tools applicable to the object
 * @param {object} options
 * @param {boolean} options.loading
 * @param {(tool: object) => void} options.onExecute
 * @param {Map<number, string|null>} [options.iconByToolId]
 * @param {() => void} options.onCreateTool
 * @returns {Array} menu items
 */
export function buildToolsContent(tools, { loading, onExecute, iconByToolId, onCreateTool }) {
  if (loading) {
    return [{ label: 'Loading...', icon: 'pi pi-spin pi-spinner', disabled: true }]
  }
  const apiTools = buildToolMenuTree(tools, onExecute, {
    iconFor: (tool) => iconByToolId?.get(tool.id) ?? null,
  })
  if (apiTools.length > 0) return apiTools
  return [
    {
      id: 'object.tools.create',
      label: 'Create a tool...',
      icon: 'pi pi-plus',
      command: onCreateTool,
    },
  ]
}

/**
 * API tools are appended after the Tools slot's static children, behind a separator; without the
 * slot, a Tools group is appended at the end.
 *
 * @param {Array} items - menu resolved by useActions
 * @param {Array} toolsContent - from `buildToolsContent`
 * @returns {Array}
 */
export function injectToolsIntoMenu(items, toolsContent) {
  const result = [...items]
  const idx = result.findIndex((item) => item.id === 'object.tools')
  if (idx !== -1) {
    const staticItems = result[idx].items ?? []
    const merged =
      staticItems.length > 0 ? [...staticItems, { separator: true }, ...toolsContent] : toolsContent
    result[idx] = { ...result[idx], visible: undefined, items: merged }
  } else {
    if (result.length > 0) result.push({ separator: true })
    result.push({ label: 'Tools', icon: 'pi pi-wrench', items: toolsContent })
  }
  return result
}
