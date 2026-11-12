// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { markdownLanguage } from '@codemirror/lang-markdown'
import {
  isNodeActive,
  collectMarkerRanges,
  collectAllMarkerRanges,
  computeEscapeChanges,
} from '@/composables/useLiveMarkdownDecorations'

function parse(text) {
  return markdownLanguage.parser.parse(text)
}

describe('isNodeActive', () => {
  it('is active when a cursor sits inside the node range', () => {
    expect(isNodeActive(2, 8, [{ from: 5, to: 5 }])).toBe(true)
  })

  it('is active when the selection overlaps the node range', () => {
    expect(isNodeActive(2, 8, [{ from: 6, to: 12 }])).toBe(true)
  })

  it('is active when the cursor touches the exact start boundary', () => {
    expect(isNodeActive(2, 8, [{ from: 2, to: 2 }])).toBe(true)
  })

  it('is active when the cursor touches the exact end boundary', () => {
    expect(isNodeActive(2, 8, [{ from: 8, to: 8 }])).toBe(true)
  })

  it('is inactive when the cursor sits strictly outside the node range', () => {
    expect(isNodeActive(2, 8, [{ from: 10, to: 10 }])).toBe(false)
  })

  it('is inactive when no ranges are given', () => {
    expect(isNodeActive(2, 8, [])).toBe(false)
  })

  it('is active if any of multiple selection ranges overlaps', () => {
    expect(
      isNodeActive(2, 8, [
        { from: 20, to: 20 },
        { from: 4, to: 4 },
      ]),
    ).toBe(true)
  })
})

describe('collectMarkerRanges', () => {
  it('dims bold marks when the cursor is outside the construct', () => {
    const text = '**bold**'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, text.length, [{ from: 20, to: 20 }])
    expect(ranges).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
    ])
  })

  it('reveals bold marks when the cursor is inside the construct', () => {
    const text = '**bold**'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, text.length, [{ from: 4, to: 4 }])
    expect(ranges).toEqual([])
  })

  it('dims inline code marks when inactive', () => {
    const text = '`code`'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, text.length, [{ from: 20, to: 20 }])
    expect(ranges).toEqual([
      { from: 0, to: 1 },
      { from: 5, to: 6 },
    ])
  })

  it('dims the heading mark when inactive', () => {
    const text = '# Heading'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, text.length, [{ from: 20, to: 20 }])
    expect(ranges).toEqual([{ from: 0, to: 1 }])
  })

  it('dims link bracket/paren marks but leaves the URL text alone', () => {
    const text = '[text](url)'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, text.length, [{ from: 20, to: 20 }])
    expect(ranges).toEqual([
      { from: 0, to: 1 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 10, to: 11 },
    ])
  })

  it('reveals only the marks whose own construct contains the cursor when nested', () => {
    // "**_bold italic_**" — outer StrongEmphasis(0,17), inner Emphasis(2,15)
    const text = '**_bold italic_**'
    const tree = parse(text)

    // cursor inside "italic" (col 10): inside both outer and inner construct ranges,
    // so both sets of marks reveal
    const insideBoth = collectMarkerRanges(tree, 0, text.length, [{ from: 10, to: 10 }])
    expect(insideBoth).toEqual([])

    // cursor far outside the whole construct: all marks dim
    const outside = collectMarkerRanges(tree, 0, text.length, [{ from: 30, to: 30 }])
    expect(outside).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 3 },
      { from: 14, to: 15 },
      { from: 15, to: 17 },
    ])
  })

  it('only collects marker ranges within the given [from, to) window', () => {
    const text = '**bold** and `code`'
    const tree = parse(text)
    const ranges = collectMarkerRanges(tree, 0, 8, [{ from: 30, to: 30 }])
    expect(ranges).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
    ])
  })
})

describe('collectAllMarkerRanges', () => {
  it('collects bold marks unconditionally, regardless of cursor position', () => {
    const text = '**bold**'
    const tree = parse(text)
    expect(collectAllMarkerRanges(tree, 0, text.length)).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
    ])
  })

  it('collects marks from multiple different constructs', () => {
    const text = '**bold** and `code` and # heading is not here'
    const tree = parse(text)
    // heading marker only recognized at line start, so plain "# heading" mid-sentence
    // here is NOT parsed as ATXHeading — only the bold and code marks are collected
    const ranges = collectAllMarkerRanges(tree, 0, text.length)
    expect(ranges).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
      { from: 13, to: 14 },
      { from: 18, to: 19 },
    ])
  })

  it('collects the heading mark at line start', () => {
    const text = '# Heading'
    const tree = parse(text)
    expect(collectAllMarkerRanges(tree, 0, text.length)).toEqual([{ from: 0, to: 1 }])
  })

  it('collects link marks', () => {
    const text = '[text](url)'
    const tree = parse(text)
    expect(collectAllMarkerRanges(tree, 0, text.length)).toEqual([
      { from: 0, to: 1 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
      { from: 10, to: 11 },
    ])
  })

  it('only collects marks within the given [from, to) window', () => {
    const text = '**bold** and `code`'
    const tree = parse(text)
    expect(collectAllMarkerRanges(tree, 0, 8)).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
    ])
  })

  it('returns an empty array for plain text with no markup', () => {
    const text = 'just plain text'
    const tree = parse(text)
    expect(collectAllMarkerRanges(tree, 0, text.length)).toEqual([])
  })
})

describe('computeEscapeChanges', () => {
  it('inserts a backslash before each character of a single-char mark', () => {
    expect(computeEscapeChanges([{ from: 0, to: 1 }])).toEqual([{ from: 0, insert: '\\' }])
  })

  it('inserts a backslash before every character of a multi-char mark', () => {
    expect(computeEscapeChanges([{ from: 0, to: 2 }])).toEqual([
      { from: 0, insert: '\\' },
      { from: 1, insert: '\\' },
    ])
  })

  it('handles multiple marker ranges', () => {
    expect(
      computeEscapeChanges([
        { from: 0, to: 2 },
        { from: 6, to: 8 },
      ]),
    ).toEqual([
      { from: 0, insert: '\\' },
      { from: 1, insert: '\\' },
      { from: 6, insert: '\\' },
      { from: 7, insert: '\\' },
    ])
  })

  it('returns an empty array for no marker ranges', () => {
    expect(computeEscapeChanges([])).toEqual([])
  })
})
