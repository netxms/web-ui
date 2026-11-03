import { describe, it, expect } from 'vitest'
import { stripMarkdownPrefix, withMarkdownPrefix, renderCommentsMarkdown } from '../commentsUtils'

describe('stripMarkdownPrefix', () => {
  it('strips the legacy markdown indicator', () => {
    expect(stripMarkdownPrefix('{}# Title')).toBe('# Title')
  })

  it('leaves unprefixed text unchanged', () => {
    expect(stripMarkdownPrefix('# Title')).toBe('# Title')
  })

  it('returns an empty string for nullish input', () => {
    expect(stripMarkdownPrefix(null)).toBe('')
    expect(stripMarkdownPrefix(undefined)).toBe('')
    expect(stripMarkdownPrefix('')).toBe('')
  })

  it('round-trips with withMarkdownPrefix', () => {
    expect(stripMarkdownPrefix(withMarkdownPrefix('hello'))).toBe('hello')
    expect(stripMarkdownPrefix(withMarkdownPrefix(''))).toBe('')
  })
})

describe('renderCommentsMarkdown', () => {
  it('renders ordinary markdown', () => {
    const html = renderCommentsMarkdown('# Title\n\nSome **bold** text.')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('preserves single line breaks (breaks: true)', () => {
    expect(renderCommentsMarkdown('line one\nline two')).toContain('<br>')
  })

  it('handles nullish input without throwing', () => {
    expect(renderCommentsMarkdown(null)).toBe('')
    expect(renderCommentsMarkdown(undefined)).toBe('')
  })

  // Object comments and AI chat replies are attacker-influenced, and marked has no sanitizer.
  it('strips script tags', () => {
    const html = renderCommentsMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('strips inline event handlers', () => {
    const html = renderCommentsMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('alert(1)')
  })

  it('strips javascript: URLs from links', () => {
    const html = renderCommentsMarkdown('[click me](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('strips svg onload payloads', () => {
    const html = renderCommentsMarkdown('<svg onload="alert(1)"></svg>')
    expect(html).not.toContain('onload')
  })

  it('strips iframes', () => {
    const html = renderCommentsMarkdown('<iframe src="https://evil.example"></iframe>')
    expect(html).not.toContain('<iframe')
  })
})

// `marked` and `dompurify` must be imported in exactly one place. eslint.config.js enforces
// this too, but a lint rule can be silenced inline; this test cannot.
describe('markdown rendering is centralized', () => {
  // Vite resolves this at transform time; paths are project-root-relative.
  const sources = import.meta.glob('/src/**/*.{vue,js}', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  const ALLOWED = '/src/utils/commentsUtils.js'

  it('finds source files to scan', () => {
    // Guards against the glob silently matching nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(100)
  })

  it.each(['marked', 'dompurify'])('only commentsUtils.js imports %s', (pkg) => {
    const pattern = new RegExp(`from\\s+['"]${pkg}['"]`)
    const offenders = Object.entries(sources)
      .filter(([path, source]) => path !== ALLOWED && pattern.test(source))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })
})
