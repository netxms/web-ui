import { describe, it, expect } from 'vitest'
import { MAX_KEY_LENGTH, isAddressableKey, validateKey } from '../persistentStorage'

describe('isAddressableKey', () => {
  it('accepts ordinary keys, including dots and URL-special characters', () => {
    for (const key of ['counter', 'Node.42.lastSeen', 'a?b#c%d', 'with space', '...']) {
      expect(isAddressableKey(key)).toBe(true)
    }
  })

  it('rejects keys the route cannot carry as one segment', () => {
    for (const key of ['a/b', '/', '.', '..']) {
      expect(isAddressableKey(key)).toBe(false)
    }
  })
})

describe('validateKey', () => {
  it('accepts a new, well-formed key', () => {
    expect(validateKey('Backup.LastRun', ['other'])).toBe('')
  })

  it('requires a key', () => {
    expect(validateKey('')).toBe('Key is required')
  })

  it('enforces the server length limit', () => {
    expect(validateKey('k'.repeat(MAX_KEY_LENGTH))).toBe('')
    expect(validateKey('k'.repeat(MAX_KEY_LENGTH + 1))).toMatch(/cannot exceed 127/)
  })

  it('rejects control characters', () => {
    expect(validateKey(`a${String.fromCharCode(9)}b`)).toMatch(/control characters/)
  })

  it('rejects keys that could not be edited or deleted afterwards', () => {
    expect(validateKey('a/b')).toBe('Key cannot contain "/"')
    expect(validateKey('..')).toBe('Key cannot be "." or ".."')
  })

  it('refuses to overwrite an existing entry from the create dialog', () => {
    expect(validateKey('counter', ['counter'])).toMatch(/already exists/)
  })
})
