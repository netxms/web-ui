import { describe, it, expect } from 'vitest'
import {
  TOOLS,
  TOOL_FAMILIES,
  getAvailableTools,
  groupToolsByFamily,
  requiredRightForTool,
} from '../toolRegistry'

describe('TOOLS', () => {
  it('gives every tool a family the sidebar can group it under', () => {
    const ids = new Set(TOOL_FAMILIES.map((family) => family.id))
    for (const tool of TOOLS) expect(ids).toContain(tool.family)
  })

  it('keeps ids unique - they are the URL segment', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length)
  })
})

describe('groupToolsByFamily', () => {
  it('groups in family declaration order and drops empty families', () => {
    const grouped = groupToolsByFamily(TOOLS)
    expect(grouped.map((f) => f.id)).toEqual(['search', 'explore', 'other'])
    expect(grouped.every((f) => f.tools.length > 0)).toBe(true)
  })

  it('keeps registry order inside a family, so Find Object leads', () => {
    const [search] = groupToolsByFamily(TOOLS)
    expect(search.tools[0].id).toBe('object-query')
  })

  it('buckets an unknown family under Other rather than dropping the tool', () => {
    const grouped = groupToolsByFamily([{ id: 'x', label: 'X', family: 'nonesuch' }])
    expect(grouped).toEqual([expect.objectContaining({ id: 'other' })])
    expect(grouped[0].tools).toHaveLength(1)
  })

  it('returns nothing for an empty or absent list', () => {
    expect(groupToolsByFamily([])).toEqual([])
    expect(groupToolsByFamily(undefined)).toEqual([])
  })
})

describe('getAvailableTools', () => {
  it('hides a tool whose required right is absent', () => {
    const ids = getAvailableTools({}).map((t) => t.id)
    expect(ids).not.toContain('mac-search')
    expect(ids).toContain('object-query')
  })

  it('shows it once the right is granted', () => {
    expect(getAvailableTools({ searchNetwork: true }).map((t) => t.id)).toContain('mac-search')
  })
})

describe('requiredRightForTool', () => {
  it("returns null for an unknown id, so a bad URL is the view's problem, not a 403", () => {
    expect(requiredRightForTool('nonesuch')).toBeNull()
    expect(requiredRightForTool('mac-search')).toBe('searchNetwork')
  })
})
