// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { reduceVersion, changelogUrl } from '@/utils/changelogUrl'

describe('reduceVersion', () => {
  it('passes through a plain three-component version', () => {
    expect(reduceVersion('6.2.4')).toBe('6.2.4')
  })

  // The server in the field reports versions like this one.
  it('truncates at the first hyphen', () => {
    expect(reduceVersion('7.0.0-rc372')).toBe('7.0.0')
  })

  it('truncates at the third dot', () => {
    expect(reduceVersion('5.2.0.1234')).toBe('5.2.0')
  })

  it('tolerates surrounding whitespace', () => {
    expect(reduceVersion('  6.2.4  ')).toBe('6.2.4')
  })

  it('returns null for anything that is not a string', () => {
    expect(reduceVersion(null)).toBeNull()
    expect(reduceVersion(undefined)).toBeNull()
    expect(reduceVersion(624)).toBeNull()
  })
})

describe('changelogUrl', () => {
  it('builds the URL with underscores', () => {
    expect(changelogUrl('6.2.4')).toBe('https://netxms.github.io/changelog/6_2_4.html')
  })

  it('builds from a version carrying a build suffix', () => {
    expect(changelogUrl('7.0.0-rc372')).toBe('https://netxms.github.io/changelog/7_0_0.html')
  })

  // Unlike legacy, which would emit 5_2.html, which does not exist.
  it('returns null for a version with fewer than three components', () => {
    expect(changelogUrl('5.2')).toBeNull()
  })

  it('returns null for a non-numeric version', () => {
    expect(changelogUrl('unknown')).toBeNull()
    expect(changelogUrl('')).toBeNull()
    expect(changelogUrl(null)).toBeNull()
  })
})
