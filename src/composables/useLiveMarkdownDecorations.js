import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// @lezer/markdown nodes that hide away from the cursor; list markers, '>' etc. always show.
const MARK_NODE_NAMES = new Set(['EmphasisMark', 'CodeMark', 'HeaderMark', 'LinkMark'])

/**
 * @param {number} nodeFrom
 * @param {number} nodeTo
 * @param {{ from: number, to: number }[]} selectionRanges
 */
export function isNodeActive(nodeFrom, nodeTo, selectionRanges) {
  return selectionRanges.some((r) => r.from <= nodeTo && r.to >= nodeFrom)
}

/**
 * Marks to dim: those whose parent construct does not overlap the selection, so nested
 * marks ('**_x_**') reveal independently.
 * @param {import('@lezer/common').Tree} tree
 * @param {number} from
 * @param {number} to
 * @param {{ from: number, to: number }[]} selectionRanges
 * @returns {{ from: number, to: number }[]}
 */
export function collectMarkerRanges(tree, from, to, selectionRanges) {
  const ranges = []
  tree.iterate({
    from,
    to,
    enter(node) {
      if (!MARK_NODE_NAMES.has(node.name)) return
      const parent = node.node.parent
      const activeFrom = parent ? parent.from : node.from
      const activeTo = parent ? parent.to : node.to
      if (!isNodeActive(activeFrom, activeTo, selectionRanges)) {
        ranges.push({ from: node.from, to: node.to })
      }
    },
  })
  return ranges
}

/**
 * @param {import('@lezer/common').Tree} tree
 * @param {number} from
 * @param {number} to
 * @returns {{ from: number, to: number }[]}
 */
export function collectAllMarkerRanges(tree, from, to) {
  const ranges = []
  tree.iterate({
    from,
    to,
    enter(node) {
      if (MARK_NODE_NAMES.has(node.name)) ranges.push({ from: node.from, to: node.to })
    },
  })
  return ranges
}

/**
 * Escapes every marker character with a backslash ('**' -> '\*\*').
 * @param {{ from: number, to: number }[]} markerRanges
 * @returns {{ from: number, insert: string }[]}
 */
export function computeEscapeChanges(markerRanges) {
  const changes = []
  for (const { from, to } of markerRanges) {
    for (let pos = from; pos < to; pos++) changes.push({ from: pos, insert: '\\' })
  }
  return changes
}

const dimMark = Decoration.mark({ class: 'cm-md-mark-dim' })

function buildDecorations(view) {
  const tree = syntaxTree(view.state)
  const selectionRanges = view.state.selection.ranges
  const marks = []
  for (const { from, to } of view.visibleRanges) {
    for (const range of collectMarkerRanges(tree, from, to, selectionRanges)) {
      marks.push(dimMark.range(range.from, range.to))
    }
  }
  return Decoration.set(marks, true)
}

const liveMarkdownPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view)
    }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

const liveMarkdownTheme = EditorView.baseTheme({
  '.cm-md-mark-dim': {
    opacity: '0.35',
    fontSize: '0.85em',
  },
})

/**
 * Live-preview mode: markdown marks dim unless the selection is inside their construct.
 * Text styling comes separately from the editor's HighlightStyle.
 * @returns {{ extensions: Array }}
 */
export function useLiveMarkdownDecorations() {
  return { extensions: [liveMarkdownPlugin, liveMarkdownTheme] }
}
