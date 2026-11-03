import { describe, it, expect } from 'vitest'
import {
  buildMemoryPayload,
  creatableMemoryScopes,
  emptyMemoryForm,
  memorySourceLabel,
  validateMemoryForm,
} from '@/utils/aiMemoryDisplay'

const form = (overrides) => ({
  ...emptyMemoryForm('user', 5),
  title: 'T',
  content: 'C',
  ...overrides,
})

describe('creatableMemoryScopes', () => {
  // Environment entries need "manage AI memory"; legacy offers that scope only to its holders.
  it('offers the environment scope only with "manage AI memory"', () => {
    expect(creatableMemoryScopes(false).map((s) => s.value)).toEqual(['user', 'object'])
    expect(creatableMemoryScopes(true).map((s) => s.value)).toEqual([
      'environment',
      'user',
      'object',
    ])
  })
})

describe('validateMemoryForm', () => {
  it('needs a title and content', () => {
    expect(validateMemoryForm(form({ title: ' ', content: '' }), true)).toEqual({
      title: 'Title is required.',
      content: 'Content is required.',
    })
  })

  it('measures the title limit in UTF-8 bytes, like the server', () => {
    expect(validateMemoryForm(form({ title: 'a'.repeat(127) }), true)).toEqual({})
    // 64 two-byte characters (a-umlaut): 64 long, 128 bytes.
    expect(
      validateMemoryForm(form({ title: String.fromCharCode(228).repeat(64) }), true).title,
    ).toMatch(/too long/)
  })

  it('needs an owner for a new user or object entry, not for an existing one', () => {
    expect(validateMemoryForm(form({ scope: 'object', scopeId: 0 }), true).scopeId).toBe(
      'Select an object.',
    )
    expect(validateMemoryForm(form({ scope: 'object', scopeId: 0 }), false)).toEqual({})
  })
})

describe('buildMemoryPayload', () => {
  it('sends scope and owner only on creation', () => {
    expect(buildMemoryPayload(form({ scope: 'object', scopeId: 9 }), true)).toEqual({
      scope: 'object',
      scopeId: 9,
      title: 'T',
      content: 'C',
      locked: false,
    })
    expect(buildMemoryPayload(form({ scope: 'environment' }), true)).not.toHaveProperty('scopeId')
    expect(buildMemoryPayload(form({ locked: true }), false)).toEqual({
      title: 'T',
      content: 'C',
      locked: true,
    })
  })
})

describe('memorySourceLabel', () => {
  it('words the source as legacy does', () => {
    expect(memorySourceLabel({ sourceType: 'chat', sourceId: 12 }, 'admin')).toBe('Chat 12 (admin)')
    expect(memorySourceLabel({ sourceType: 'operator', sourceId: 3 }, 'ai-operator')).toBe(
      'AI operator 3 (ai-operator)',
    )
    expect(memorySourceLabel({ sourceType: 'human', sourceId: 0 }, 'admin')).toBe('admin')
  })
})
