// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useEppChainDrafts } from '@/composables/useEppChainDrafts'

const RULE = (guid) => ({ guid, comments: guid, flags: 0 })

describe('useEppChainDrafts', () => {
  it('falls back to the server copy until a chain is edited', () => {
    const drafts = useEppChainDrafts()
    const server = [RULE('a')]
    expect(drafts.rulesFor(0, server)).toBe(server)
    expect(drafts.isDirty(0)).toBe(false)
    expect(drafts.hasAnyDirty.value).toBe(false)
  })

  it('holds an edit per chain', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 1)
    drafts.setRules(2, [RULE('b'), RULE('c')], 7)

    expect(drafts.rulesFor(0, [])).toHaveLength(1)
    expect(drafts.rulesFor(2, [])).toHaveLength(2)
    expect(drafts.rulesFor(3, [RULE('z')])).toEqual([RULE('z')])
    expect(drafts.dirtyChainIds.value).toEqual(new Set([0, 2]))
    expect(drafts.dirtyCount.value).toBe(2)
  })

  it('pins the version the first edit was made against', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 4)
    drafts.setRules(0, [RULE('a'), RULE('b')], 9)
    expect(drafts.versionFor(0, 12)).toBe(4)
  })

  it('reads the server version for a chain with no draft', () => {
    const drafts = useEppChainDrafts()
    expect(drafts.versionFor(0, 12)).toBe(12)
    expect(drafts.versionFor(0, undefined)).toBe(null)
  })

  it('keeps a saved draft clean and on the new version', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 4)
    drafts.markSaved(0, 5)

    expect(drafts.isDirty(0)).toBe(false)
    expect(drafts.hasAnyDirty.value).toBe(false)
    expect(drafts.rulesFor(0, [])).toHaveLength(1)
    expect(drafts.versionFor(0, 99)).toBe(5)
  })

  it('keeps a rejected save dirty and marks it unsavable until reloaded', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 4)
    drafts.markConflicted(0)

    expect(drafts.isConflicted(0)).toBe(true)
    expect(drafts.isDirty(0)).toBe(true)
    expect(drafts.rulesFor(0, [])).toHaveLength(1)
  })

  it('carries the conflict through a further edit', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 4)
    drafts.markConflicted(0)
    drafts.setRules(0, [RULE('a'), RULE('b')], 4)
    expect(drafts.isConflicted(0)).toBe(true)
  })

  it('discards one chain without touching the others', () => {
    const drafts = useEppChainDrafts()
    drafts.setRules(0, [RULE('a')], 1)
    drafts.setRules(2, [RULE('b')], 1)

    drafts.discard(0)
    expect(drafts.dirtyChainIds.value).toEqual(new Set([2]))
    expect(drafts.rulesFor(0, [RULE('server')])).toEqual([RULE('server')])

    drafts.discardAll()
    expect(drafts.hasAnyDirty.value).toBe(false)
  })

  it('ignores markSaved and markConflicted for a chain with no draft', () => {
    const drafts = useEppChainDrafts()
    expect(() => drafts.markSaved(9, 2)).not.toThrow()
    expect(() => drafts.markConflicted(9)).not.toThrow()
    expect(drafts.draftFor(9)).toBeUndefined()
  })
})
