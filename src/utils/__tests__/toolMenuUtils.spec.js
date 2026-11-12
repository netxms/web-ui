// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { buildToolMenuTree, buildToolsContent, injectToolsIntoMenu } from '@/utils/toolMenuUtils'

const tools = [
  { id: 1, name: '&Info->&Agent->Loaded subagents', type: 'agent-list' },
  { id: 2, name: 'Connect->Web', type: 'url' },
  { id: 3, name: 'Local console', type: 'command' },
]

describe('buildToolMenuTree', () => {
  it('nests by "->", strips accelerators, and leaves out local command tools', () => {
    const menu = buildToolMenuTree(tools, vi.fn())
    expect(menu.map((item) => item.label)).toEqual(['Connect', 'Info'])
    expect(menu[1].items[0].label).toBe('Agent')
    expect(menu[1].items[0].items[0].label).toBe('Loaded subagents')
  })

  it('gives each tool its library icon next to the type icon, which stays the fallback', () => {
    const icons = new Map([[2, 'web-icon-guid']])
    const menu = buildToolMenuTree(tools, vi.fn(), {
      iconFor: (tool) => icons.get(tool.id) ?? null,
    })

    const web = menu[0].items[0]
    expect(web).toMatchObject({
      label: 'Web',
      icon: 'pi pi-external-link',
      iconImage: 'web-icon-guid',
    })
    const subagents = menu[1].items[0].items[0]
    expect(subagents.iconImage).toBeNull()
    expect(subagents.icon).toBe('pi pi-table')
  })

  it('works without an icon source, as before', () => {
    const [connect] = buildToolMenuTree(tools, vi.fn())
    expect(connect.items[0].iconImage).toBeNull()
  })
})

describe('buildToolsContent', () => {
  it('shows a spinner while the tools load', () => {
    const items = buildToolsContent(undefined, { loading: true, onExecute: vi.fn() })
    expect(items).toEqual([expect.objectContaining({ label: 'Loading...', disabled: true })])
  })

  it('offers to create a tool when none applies', () => {
    const onCreateTool = vi.fn()
    const [item] = buildToolsContent([], { loading: false, onExecute: vi.fn(), onCreateTool })
    expect(item.label).toBe('Create a tool...')
    item.command()
    expect(onCreateTool).toHaveBeenCalled()
  })
})

describe('injectToolsIntoMenu', () => {
  const tools = [{ id: 'object.tool.1', label: 'Ping' }]

  it('appends server tools after the static children of the Tools slot', () => {
    const menu = [{ id: 'object.tools', items: [{ id: 'object.tools.wakeUp' }] }]
    const [slot] = injectToolsIntoMenu(menu, tools)
    expect(slot.items.map((i) => i.id ?? 'separator')).toEqual([
      'object.tools.wakeUp',
      'separator',
      'object.tool.1',
    ])
  })

  it('adds a Tools group when the menu has no slot for it', () => {
    const result = injectToolsIntoMenu([{ id: 'object.delete' }], tools)
    expect(result.at(-1)).toMatchObject({ label: 'Tools', items: tools })
  })
})
