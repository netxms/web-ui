<script setup>
// Plain mode renders thousands of lines as two <pre> nodes (text and line numbers) aligned by
// line-height; diff mode renders a row per line, affordable only over collapsed hunks.
// Not CodeMirror: its virtualised viewport breaks the browser's own Ctrl+F.
import { computed } from 'vue'
import { collapseUnchanged } from '@/utils/textDiff'

const props = defineProps({
  /** Ignored when `diff` is set. */
  text: { type: String, default: null },
  /**
   * Output of `diffLines()`, uncollapsed.
   * @type {import('vue').PropType<Array<object>>}
   */
  diff: { type: Array, default: null },
  diffContext: { type: Number, default: 3 },
  emptyMessage: { type: String, default: 'No content.' },
  label: { type: String, required: true },
})

const isDiff = computed(() => Array.isArray(props.diff))

const plainLines = computed(() => {
  if (isDiff.value || !props.text) return []
  return props.text.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n')
})

const plainGutter = computed(() => plainLines.value.map((_, i) => i + 1).join('\n'))

const plainText = computed(() => plainLines.value.join('\n'))

const diffRows = computed(() =>
  isDiff.value ? collapseUnchanged(props.diff, props.diffContext) : [],
)

const isEmpty = computed(() =>
  isDiff.value ? props.diff.length === 0 : plainLines.value.length === 0,
)

const SIGNS = { added: '+', removed: '-', context: ' ' }
</script>

<template>
  <div class="config-viewer">
    <div v-if="isEmpty" class="config-viewer__empty">{{ emptyMessage }}</div>

    <div
      v-else-if="isDiff"
      class="config-viewer__scroll"
      tabindex="0"
      role="group"
      :aria-label="label"
    >
      <div class="config-viewer__diff">
        <template v-for="(row, index) in diffRows" :key="index">
          <div v-if="row.kind === 'gap'" class="diff-gap">
            <span class="diff-gap__label">
              {{ $plural(row.skipped, 'unchanged line', 'unchanged lines') }}
            </span>
          </div>
          <div v-else class="diff-line" :class="`diff-line--${row.kind}`">
            <span class="diff-line__num">{{ row.oldLine ?? '' }}</span>
            <span class="diff-line__num">{{ row.newLine ?? '' }}</span>
            <span class="diff-line__sign" aria-hidden="true">{{ SIGNS[row.kind] }}</span>
            <span class="diff-line__text">{{ row.text }}</span>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="config-viewer__scroll" tabindex="0" role="group" :aria-label="label">
      <div class="config-viewer__plain">
        <pre class="plain-gutter" aria-hidden="true">{{ plainGutter }}</pre>
        <pre class="plain-text">{{ plainText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-viewer {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-card);
}

.config-viewer__empty {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.config-viewer__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.config-viewer__scroll:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.config-viewer__plain {
  display: flex;
  align-items: flex-start;
  /* Both columns must scroll as one. */
  min-width: max-content;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.plain-gutter,
.plain-text {
  margin: 0;
  padding: 0.5rem 0;
  font: inherit;
  white-space: pre;
}

.plain-gutter {
  position: sticky;
  left: 0;
  padding-inline: 0.75rem;
  text-align: end;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border-inline-end: 1px solid var(--p-surface-border);
  user-select: none;
}

.plain-text {
  padding-inline: 0.75rem;
  color: var(--p-text-color);
}

.config-viewer__diff {
  min-width: max-content;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  padding-block: 0.5rem;
}

.diff-line {
  display: flex;
  align-items: baseline;
  white-space: pre;
}

.diff-line__num {
  flex: 0 0 3.5rem;
  padding-inline-end: 0.5rem;
  text-align: end;
  color: var(--p-text-muted-color);
  user-select: none;
}

.diff-line__sign {
  flex: 0 0 1.25rem;
  padding-inline-start: 0.5rem;
  color: var(--p-text-muted-color);
  user-select: none;
}

.diff-line__text {
  padding-inline-end: 0.75rem;
}

.diff-line--added {
  background: color-mix(in srgb, var(--p-green-500) 14%, transparent);
}

.diff-line--added .diff-line__sign {
  color: var(--p-green-600);
}

.diff-line--removed {
  background: color-mix(in srgb, var(--p-red-500) 14%, transparent);
}

.diff-line--removed .diff-line__sign {
  color: var(--p-red-600);
}

.diff-gap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  margin-block: 0.25rem;
  background: var(--p-surface-ground);
  border-block: 1px solid var(--p-surface-border);
  position: sticky;
  left: 0;
}

.diff-gap__label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
