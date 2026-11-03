import { EditorView, Decoration } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'

const setErrorLine = StateEffect.define()

const errorLineDecoration = Decoration.line({ class: 'cm-error-line' })

const errorLineField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorLine)) {
        if (effect.value === null) return Decoration.none
        const line = tr.state.doc.line(effect.value)
        return Decoration.set([errorLineDecoration.range(line.from)])
      }
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

const errorLineTheme = EditorView.baseTheme({
  '.cm-error-line': {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderLeft: '3px solid #e53935',
  },
})

/**
 * @returns {{ extensions: Array, setError: (view: EditorView, line: number|null) => void }}
 */
export function useCodeMirrorErrorLine() {
  const extensions = [errorLineField, errorLineTheme]

  function setError(view, line) {
    if (!view) return
    const maxLine = view.state.doc.lines
    const safeLine = line !== null && line >= 1 && line <= maxLine ? line : null
    view.dispatch({ effects: setErrorLine.of(safeLine) })
  }

  return { extensions, setError }
}
