// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { splitLines, diffLines, diffStats, collapseUnchanged, diffToText } from '@/utils/textDiff'

describe('splitLines', () => {
  it('returns no lines for empty input', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines(null)).toEqual([])
  })

  it('does not turn a trailing newline into an empty final line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\nb')).toEqual(['a', 'b'])
  })

  it('normalises CRLF so a line-ending change is not a full rewrite', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b'])
    expect(diffStats(diffLines('a\nb', 'a\r\nb')).changed).toBe(false)
  })

  it('keeps interior blank lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
  })
})

describe('diffLines', () => {
  it('reports identical texts as all context', () => {
    const result = diffLines('one\ntwo\nthree', 'one\ntwo\nthree')
    expect(result.map((l) => l.kind)).toEqual(['context', 'context', 'context'])
    expect(diffStats(result)).toEqual({ added: 0, removed: 0, changed: false })
  })

  it('reports a changed line as a removal followed by an addition', () => {
    const result = diffLines('a\nb\nc', 'a\nB\nc')
    expect(result.map((l) => `${l.kind}:${l.text}`)).toEqual([
      'context:a',
      'removed:b',
      'added:B',
      'context:c',
    ])
  })

  it('numbers lines against the side they exist on', () => {
    const result = diffLines('a\nb\nc', 'a\nB\nc')
    expect(result.map((l) => [l.oldLine, l.newLine])).toEqual([
      [1, 1],
      [2, null],
      [null, 2],
      [3, 3],
    ])
  })

  it('handles an insertion in the middle', () => {
    const result = diffLines('a\nc', 'a\nb\nc')
    expect(result.map((l) => `${l.kind}:${l.text}`)).toEqual(['context:a', 'added:b', 'context:c'])
    expect(diffStats(result)).toEqual({ added: 1, removed: 0, changed: true })
  })

  it('handles a deletion in the middle', () => {
    const result = diffLines('a\nb\nc', 'a\nc')
    expect(result.map((l) => `${l.kind}:${l.text}`)).toEqual([
      'context:a',
      'removed:b',
      'context:c',
    ])
  })

  it('numbers trailing context against both sides after an inserted line', () => {
    // The suffix is emitted from the old side, so its new-side numbers have to account for
    // the lines added before it.
    const result = diffLines('a\nz', 'a\nb\nc\nz')
    const trailing = result.at(-1)
    expect(trailing).toMatchObject({ kind: 'context', text: 'z', oldLine: 2, newLine: 4 })
  })

  it('treats an empty old text as all additions and vice versa', () => {
    expect(diffLines('', 'a\nb').map((l) => l.kind)).toEqual(['added', 'added'])
    expect(diffLines('a\nb', '').map((l) => l.kind)).toEqual(['removed', 'removed'])
  })

  it('reconstructs both sides from the result', () => {
    const oldText = 'interface Gi0/1\n description uplink\n no shutdown\nline vty 0 4'
    const newText = 'interface Gi0/1\n description core uplink\n no shutdown\nline vty 0 15'
    const result = diffLines(oldText, newText)
    const rebuiltOld = result
      .filter((l) => l.kind !== 'added')
      .map((l) => l.text)
      .join('\n')
    const rebuiltNew = result
      .filter((l) => l.kind !== 'removed')
      .map((l) => l.text)
      .join('\n')
    expect(rebuiltOld).toBe(oldText)
    expect(rebuiltNew).toBe(newText)
  })

  it('stays linear when only the middle of a large config changed', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    const changed = [...lines]
    changed[2500] = 'line 2500 modified'
    const result = diffLines(lines.join('\n'), changed.join('\n'))
    expect(diffStats(result)).toEqual({ added: 1, removed: 1, changed: true })
  })
})

describe('collapseUnchanged', () => {
  it('keeps context lines around each change and folds the rest into gaps', () => {
    const lines = diffLines(
      Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n'),
      Array.from({ length: 40 }, (_, i) => (i === 20 ? 'changed' : `l${i}`)).join('\n'),
    )
    const collapsed = collapseUnchanged(lines, 2)
    const gaps = collapsed.filter((row) => row.kind === 'gap')
    expect(gaps).toHaveLength(2)
    expect(collapsed.filter((row) => row.kind === 'context')).toHaveLength(4)
    // Every line is accounted for: rendered rows plus everything the gaps swallowed.
    const rendered = collapsed.filter((row) => row.kind !== 'gap').length
    const skipped = gaps.reduce((sum, gap) => sum + gap.skipped, 0)
    expect(rendered + skipped).toBe(lines.length)
  })

  it('collapses nothing when there is no change to anchor context on', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc')
    const collapsed = collapseUnchanged(lines, 2)
    expect(collapsed).toEqual([{ kind: 'gap', skipped: 3 }])
  })
})

describe('diffToText', () => {
  it('renders unified-diff prefixes', () => {
    expect(diffToText(diffLines('a\nb', 'a\nB'))).toBe(' a\n-b\n+B')
  })
})
