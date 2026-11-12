// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { escapeHtml, isSafeExternalUrl, REMOTE_ACCESS_SCHEMES } from '../sanitize'

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('escapes ampersands before other entities (no double-encoding bug)', () => {
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('neutralizes an object name carrying an image payload', () => {
    const escaped = escapeHtml('<img src=x onerror=alert(1)>')
    expect(escaped).not.toContain('<img')
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('leaves ordinary object names untouched', () => {
    expect(escapeHtml('core-switch-01.example.net')).toBe('core-switch-01.example.net')
  })

  it('coerces non-strings and treats nullish as empty', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(0)).toBe('0')
    expect(escapeHtml(false)).toBe('false')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('https://example.com/path?q=1#f')).toBe(true)
  })

  it('is case-insensitive about the scheme', () => {
    expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isSafeExternalUrl('  https://example.com  ')).toBe(true)
  })

  it('rejects javascript: URIs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('JaVaScRiPt:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('  javascript:alert(1)')).toBe(false)
  })

  it('rejects data: and blob: URIs', () => {
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('blob:https://example.com/uuid')).toBe(false)
  })

  it('rejects relative and malformed input', () => {
    expect(isSafeExternalUrl('/objects/42')).toBe(false)
    expect(isSafeExternalUrl('example.com')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('   ')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })

  it('rejects remote-access schemes unless explicitly allowed', () => {
    expect(isSafeExternalUrl('ssh://host')).toBe(false)
    expect(isSafeExternalUrl('ssh://host', { extraSchemes: REMOTE_ACCESS_SCHEMES })).toBe(true)
    expect(isSafeExternalUrl('rdp://host', { extraSchemes: REMOTE_ACCESS_SCHEMES })).toBe(true)
  })

  it('still rejects javascript: when extra schemes are allowed', () => {
    expect(isSafeExternalUrl('javascript:alert(1)', { extraSchemes: REMOTE_ACCESS_SCHEMES })).toBe(
      false,
    )
  })
})
