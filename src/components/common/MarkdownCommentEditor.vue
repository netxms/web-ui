<script setup>
import { computed, ref } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  syntaxTree,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { Bold, Italic, Code, Link, List, RemoveFormatting } from 'lucide-vue-next'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'
import {
  useLiveMarkdownDecorations,
  collectAllMarkerRanges,
  computeEscapeChanges,
} from '@/composables/useLiveMarkdownDecorations'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'

const props = defineProps({
  modelValue: { type: String, default: '' },
  rows: { type: Number, default: 6 },
  placeholder: { type: String, default: 'Add comments... Supports Markdown formatting.' },
  /** Grow to fill the parent's height. */
  fill: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { themeExtensions } = useCodeMirrorTheme()

// Styles the markdown constructs while typing. With a custom extension set instead of
// basicSetup, no highlight style applies on its own, so both are added explicitly.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.25em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.15em' },
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--p-primary-color)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--p-primary-color)' },
  { tag: tags.monospace, color: 'var(--p-text-muted-color)' },
  { tag: tags.quote, color: 'var(--p-text-muted-color)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--p-text-muted-color)' },
])

const MODE_OPTIONS = [
  { label: 'Live', value: 'live' },
  { label: 'Preview', value: 'preview' },
]
const mode = ref('live')

const { extensions: liveMarkdownExtensions } = useLiveMarkdownDecorations()

const cmExtensions = computed(() => [
  markdown(),
  syntaxHighlighting(markdownHighlight),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ...themeExtensions.value,
  EditorView.lineWrapping,
  ...liveMarkdownExtensions,
])

const editorMinHeight = computed(() => `calc(${props.rows} * 1.25rem + 0.75rem)`)

const cmView = ref(null)
function handleReady({ view }) {
  cmView.value = view
}

const renderedHtml = computed(() => renderCommentsMarkdown(props.modelValue))

const hintExpanded = ref(false)

const HINT_ROWS = [
  { syntax: '**bold**', desc: 'bold text' },
  { syntax: '_italic_', desc: 'italic text' },
  { syntax: '`code`', desc: 'inline code' },
  { syntax: '[title](https://…)', desc: 'link' },
  { syntax: '- item', desc: 'bulleted list' },
  { syntax: '1. item', desc: 'numbered list' },
  { syntax: '# Heading', desc: 'heading (at line start)' },
  { syntax: '\\*', desc: 'literal * (escape formatting characters with \\)' },
]

function wrapSelection(before, after, placeholderText) {
  const view = cmView.value
  if (!view) return
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to) || placeholderText
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  })
  view.focus()
}

function prefixLines(prefix) {
  const view = cmView.value
  if (!view) return
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes = []
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    if (line.text) changes.push({ from: line.from, insert: prefix })
  }
  if (!changes.length) changes.push({ from: startLine.from, insert: prefix })
  view.dispatch({ changes })
  view.focus()
}

// Escapes the marks rather than deleting them ('**bold**' -> '\*\*bold\*\*'), keeping the
// original characters (CommonMark's backslash escape).
function clearFormatting() {
  const view = cmView.value
  if (!view) return
  const sel = view.state.selection.main
  const { from, to } = sel.empty ? { from: 0, to: view.state.doc.length } : sel
  const markerRanges = collectAllMarkerRanges(syntaxTree(view.state), from, to)
  if (!markerRanges.length) return
  view.dispatch({ changes: computeEscapeChanges(markerRanges) })
  view.focus()
}

const FORMAT_ACTIONS = [
  { icon: Bold, label: 'Bold', run: () => wrapSelection('**', '**', 'bold text') },
  { icon: Italic, label: 'Italic', run: () => wrapSelection('_', '_', 'italic text') },
  { icon: Code, label: 'Code', run: () => wrapSelection('`', '`', 'code') },
  { icon: Link, label: 'Link', run: () => wrapSelection('[', '](https://)', 'link text') },
  { icon: List, label: 'Bulleted list', run: () => prefixLines('- ') },
  { icon: RemoveFormatting, label: 'Clear formatting', run: clearFormatting },
]
</script>

<template>
  <div class="md-comment-editor" :class="{ 'md-fill': fill }">
    <div class="editor-container">
      <Transition name="hint-slide">
        <div v-if="hintExpanded" class="hint-panel">
          <div class="hint-section-title">Markdown formatting</div>
          <div class="hint-table">
            <div v-for="row in HINT_ROWS" :key="row.syntax" class="hint-row">
              <code>{{ row.syntax }}</code
              ><span>{{ row.desc }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <div class="editor-toolbar">
        <template v-if="mode === 'live'">
          <Button
            v-for="action in FORMAT_ACTIONS"
            :key="action.label"
            v-tooltip.bottom="action.label"
            text
            severity="secondary"
            size="small"
            class="format-btn"
            :aria-label="action.label"
            @click="action.run"
          >
            <template #icon><component :is="action.icon" :size="15" /></template>
          </Button>
          <Button
            v-tooltip.bottom="hintExpanded ? 'Hide formatting guide' : 'Formatting guide'"
            icon="pi pi-info-circle"
            text
            severity="secondary"
            size="small"
            class="format-btn"
            :class="{ 'btn-active': hintExpanded }"
            aria-label="Formatting guide"
            @click="hintExpanded = !hintExpanded"
          />
          <div class="toolbar-separator" />
        </template>
        <SelectButton
          v-model="mode"
          :options="MODE_OPTIONS"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          class="mode-toggle"
        />
      </div>

      <div class="editor-wrap">
        <!-- Tab moves to the next control instead of indenting: in the middle of a form, an
             indenting Tab traps the keyboard. -->
        <Codemirror
          v-show="mode === 'live'"
          :model-value="modelValue"
          :extensions="cmExtensions"
          :indent-with-tab="false"
          :tab-size="2"
          :placeholder="placeholder"
          @ready="handleReady"
          @update:model-value="emit('update:modelValue', $event)"
        />

        <div
          v-if="mode === 'preview'"
          class="md-preview"
          :class="{ 'is-empty': !modelValue }"
          v-html="modelValue ? renderedHtml : 'Nothing to preview yet.'"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-comment-editor {
  display: flex;
  flex-direction: column;
}

.md-fill {
  flex: 1;
  min-height: 0;
}

.editor-container {
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius, 6px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.md-fill .editor-container {
  flex: 1;
  min-height: 0;
}

.hint-panel {
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
  padding: 0.5rem 0.75rem;
  overflow: hidden;
  flex-shrink: 0;
}

.hint-section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.375rem;
}

.hint-table {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.hint-row {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  font-size: 0.8125rem;
}

.hint-row code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--p-primary-color);
  background: var(--p-surface-ground);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.hint-row span {
  color: var(--p-text-muted-color);
}

.hint-slide-enter-active,
.hint-slide-leave-active {
  transition:
    max-height 0.2s ease,
    opacity 0.15s ease;
  max-height: 20rem;
}

.hint-slide-enter-from,
.hint-slide-leave-to {
  max-height: 0;
  opacity: 0;
}

.editor-wrap {
  background: var(--p-surface-card);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-wrap :deep(.v-codemirror) {
  display: block;
  flex: 1;
  min-height: 0;
}

.editor-wrap :deep(.cm-editor) {
  min-height: v-bind(editorMinHeight);
  height: 100%;
  font-size: 0.875rem;
}

.editor-wrap :deep(.cm-scroller) {
  font-family: var(--font-mono);
  line-height: 1.5;
}

.editor-wrap :deep(.cm-content) {
  padding-top: 0.625rem;
  padding-bottom: 0.75rem;
}

/* cm-scroller's align-items: flex-start leaves the gutter no definite height. */
.editor-wrap :deep(.cm-gutters) {
  min-height: v-bind(editorMinHeight) !important;
}

.md-fill .editor-wrap :deep(.cm-gutters) {
  min-height: 100% !important;
}

.editor-wrap :deep(.cm-line) {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.editor-wrap :deep(.cm-focused) {
  outline: none;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  justify-content: flex-end;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
  padding: 0.375rem 0.5rem;
  flex-shrink: 0;
}

.format-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 4px;
}

.btn-active {
  color: var(--p-primary-color) !important;
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent) !important;
}

.toolbar-separator {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.25rem;
}

.mode-toggle :deep(.p-togglebutton) {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.md-preview {
  flex: 1;
  min-height: v-bind(editorMinHeight);
  overflow-y: auto;
  padding: 0.75rem 1.25rem 1rem;
  max-width: 100%;
  color: var(--p-text-color);
  font-size: 0.9375rem;
  line-height: 1.6;
}

.md-preview.is-empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.md-preview :deep(> *) {
  max-width: 52rem;
}

.md-preview :deep(p) {
  margin: 0 0 0.75em;
}

.md-preview :deep(p:last-child) {
  margin-bottom: 0;
}

.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3),
.md-preview :deep(h4) {
  margin: 1em 0 0.5em;
  line-height: 1.3;
  font-weight: 600;
}

.md-preview :deep(h1:first-child),
.md-preview :deep(h2:first-child),
.md-preview :deep(h3:first-child),
.md-preview :deep(p:first-child) {
  margin-top: 0;
}

.md-preview :deep(h1) {
  font-size: 1.375rem;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--p-surface-border);
}

.md-preview :deep(h2) {
  font-size: 1.1875rem;
}

.md-preview :deep(h3),
.md-preview :deep(h4) {
  font-size: 1.0625rem;
}

.md-preview :deep(ul),
.md-preview :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.md-preview :deep(li) {
  margin: 0.25em 0;
}

.md-preview :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: color-mix(in srgb, var(--p-surface-border) 40%, transparent);
  border-radius: 4px;
  padding: 0.125em 0.375em;
}

.md-preview :deep(pre) {
  margin: 0.75em 0;
  padding: 0.75em 1em;
  background: color-mix(in srgb, var(--p-surface-border) 40%, transparent);
  border-radius: 6px;
  overflow-x: auto;
}

.md-preview :deep(pre code) {
  background: none;
  padding: 0;
}

.md-preview :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.25em 1em;
  border-left: 3px solid var(--p-primary-color);
  color: var(--p-text-muted-color);
  background: color-mix(in srgb, var(--p-surface-border) 20%, transparent);
  border-radius: 0 4px 4px 0;
}

.md-preview :deep(table) {
  border-collapse: collapse;
  width: auto;
  margin: 0.75em 0;
}

.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid var(--p-surface-border);
  padding: 0.5em 0.75em;
  text-align: left;
}

.md-preview :deep(th) {
  background: color-mix(in srgb, var(--p-surface-border) 50%, transparent);
  font-weight: 600;
}

.md-preview :deep(a) {
  color: var(--p-primary-color);
}

.md-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--p-surface-border);
  margin: 1em 0;
}
</style>
