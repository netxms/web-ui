<script setup>
import { ref, computed, watch } from 'vue'

const SCRIPT_HINTS = {
  'epp-filter': {
    variables: [
      { name: '$object', desc: 'event source object' },
      { name: '$node', desc: 'event source object if its class is Node' },
      { name: '$event', desc: 'event being processed' },
      { name: '$dci', desc: 'DCI associated with this event' },
    ],
    returnValue: { value: 'true', note: 'to pass event through rule filter' },
  },
  'epp-action': {
    variables: [
      { name: '$object', desc: 'event source object' },
      { name: '$node', desc: 'event source object if its class is Node' },
      { name: '$event', desc: 'event being processed' },
      { name: '$dci', desc: 'DCI associated with this event' },
    ],
  },
  'template-auto-apply': {
    variables: [
      { name: '$node', desc: 'node being tested (null if object is not a node)' },
      { name: '$object', desc: 'object being tested' },
      { name: '$template', desc: 'this template object' },
    ],
    returnValue: {
      value: 'true / false / null',
      note: 'true to apply this template to node, false to remove, null to make no changes',
    },
  },
  'business-service-object-auto-bind': {
    variables: [
      { name: '$node', desc: 'node being tested (null if object is not a node)' },
      { name: '$object', desc: 'object being tested' },
      { name: '$service', desc: 'current business service this check belongs to' },
    ],
    returnValue: {
      value: 'true / false / null',
      note: 'true to bind object to this business service, false to unbind, null to make no changes',
    },
  },
  'business-service-dci-auto-bind': {
    variables: [
      { name: '$node', desc: 'node being tested (null if object is not a node)' },
      { name: '$object', desc: 'object being tested' },
      { name: '$dci', desc: 'DCI object being tested' },
      { name: '$service', desc: 'current business service this check belongs to' },
    ],
    returnValue: {
      value: 'true / false / null',
      note: 'true to bind dci to this business service, false to unbind, null to make no changes',
    },
  },
  'business-service-check': {
    variables: [
      { name: '$object', desc: 'related object of the check (null if none is set)' },
      { name: '$node', desc: 'related object if it is a node, otherwise null' },
      { name: '$service', desc: 'business service this check belongs to' },
      { name: '$reason', desc: 'set it to give the failure reason when returning false' },
      { name: 'OK / FAIL', desc: 'constants for true and false' },
    ],
    returnValue: {
      value: 'true / false / string',
      note: 'true if the check passes; false, or a string with the failure reason, if it fails',
    },
  },
  'business-service-prototype-instance-discovery': {
    variables: [
      { name: '$1', desc: 'instance to test' },
      { name: '$2', desc: 'instance data (secondary value for Script method)' },
      { name: '$node', desc: 'related node' },
      { name: '$prototype', desc: 'this business service prototype object' },
    ],
    returnValue: {
      value: 'true / false / array',
      note: 'true/false to accept or reject instance without additional changes, or an array of one or two elements to accept the instance while modifying it: 1st element - new instance name, 2nd element - new instance display name',
    },
  },
  'asset-autofill': {
    variables: [
      { name: '$object', desc: 'object associated with this asset' },
      { name: '$node', desc: 'node associated with this asset or null' },
      { name: '$asset', desc: 'current asset object' },
      { name: '$name', desc: 'updated property name' },
      { name: '$value', desc: 'current property value' },
      { name: '$enumValues', desc: 'array with possible enum values' },
    ],
    returnValue: { value: 'new value', note: 'new value for asset property' },
  },
  'dci-transformation': {
    variables: [
      { name: '$1', desc: 'value to transform (after delta calculation)' },
      { name: '$dci', desc: 'this DCI object' },
      { name: '$isCluster', desc: 'true if DCI is on cluster' },
      { name: '$node', desc: 'current node object (null if DCI is not on the node)' },
      { name: '$object', desc: 'current object' },
    ],
    returnValue: {
      value: 'transformed value',
      note: 'transformed DCI value, or null to keep original value',
    },
  },
  'object-query': {
    variables: [
      { name: '$object', desc: 'object being tested' },
      { name: '$node', desc: 'object being tested if its class is Node' },
    ],
    returnValue: {
      value: 'true / false / map',
      note: 'true or false to include/exclude the object; returning a map of name→value pairs includes the object and adds those as extra result fields',
    },
  },
  'dci-instance-filter': {
    variables: [
      { name: '$1', desc: 'instance to test' },
      {
        name: '$2',
        desc: 'instance data (value for given OID for SNMP Walk - Values method, secondary value for Script method)',
      },
      { name: '$dci', desc: 'this DCI object' },
      { name: '$isCluster', desc: 'true if DCI is on cluster' },
      { name: '$node', desc: 'current node object (null if DCI is not on the node)' },
      { name: '$object', desc: 'current object' },
    ],
    returnValue: {
      value: 'true/false or array',
      note: 'true/false to accept or reject instance; or array of 1-3 elements: new instance name, new display name, related object',
    },
  },
  'dci-threshold-script': {
    variables: [
      { name: '$1', desc: 'current DCI value' },
      { name: '$2', desc: 'threshold value' },
      { name: '$dci', desc: 'this DCI object' },
      { name: '$node', desc: 'current node object (null if DCI is not on the node)' },
    ],
    returnValue: { value: 'true / false', note: 'true if threshold condition is met' },
  },
  // The server ignores the return value.
  'snmp-trap-transformation': {
    variables: [
      { name: '$trap', desc: 'trap OID (string)' },
      { name: '$varbinds', desc: 'array of the trap varbinds (SNMP varbind objects)' },
      { name: '$event', desc: 'event being prepared; change it here' },
      { name: '$node', desc: 'node the trap came from (can be null)' },
      { name: '$object', desc: 'same as $node' },
    ],
    returnValue: { value: 'ignored', note: 'the event is always generated' },
  },
  'network-map-filter': {
    variables: [
      { name: '$object', desc: 'current object' },
      { name: '$node', desc: "current object if it's class is Node" },
    ],
    returnValue: { value: 'true', note: 'to include current object into this map' },
  },
  'network-map-link-script': {
    variables: [
      { name: '$object', desc: 'current map' },
      { name: '$link', desc: 'currently processed link information' },
    ],
  },
  'dashboard-script': {
    variables: [
      { name: '$object', desc: 'object selected above, or the dashboard itself when none is' },
      { name: '$node', desc: 'same object, if it is a node' },
      { name: '$isCluster', desc: 'true if the object is a cluster' },
    ],
    returnValue: {
      value: 'hash or array',
      note: 'name -> value pairs, or elements with name, value and color',
    },
  },
  'ai-operator-check': {
    variables: [{ name: '$object', desc: 'bound object (null if none)' }],
    returnValue: {
      value: 'null / false, string, or hash',
      note: 'null or false - quiet; a string - fired, used as the title; a hash with title, severity and details - fired; anything else - check error',
    },
  },
}
import { Codemirror } from 'vue-codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import { useNxslLanguage } from '@/composables/useNxslLanguage'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'
import { useCodeMirrorErrorLine } from '@/composables/useCodeMirrorErrorLine'
import { compileScript } from '@/api/scriptApi'

const props = defineProps({
  modelValue: { type: String, default: '' },
  hint: { type: String, default: null },
  hintKey: { type: String, default: null },
  placeholder: { type: String, default: '// NXSL script' },
  showCompile: { type: Boolean, default: false },
  errorLine: { type: Number, default: null },
  rows: { type: Number, default: 8 },
  /** Compile stays available: it reads, it does not write. */
  readonly: { type: Boolean, default: false },
})

const resolvedHint = computed(() => (props.hintKey ? SCRIPT_HINTS[props.hintKey] : null))
const hasHint = computed(() => resolvedHint.value != null || props.hint != null)

const emit = defineEmits(['update:modelValue', 'compile'])

const nxslLanguage = useNxslLanguage()
const { themeExtensions } = useCodeMirrorTheme()
const { extensions: errorLineExtensions, setError } = useCodeMirrorErrorLine()

const cmView = ref(null)
const hintExpanded = ref(false)
const tipsPopover = ref()

const compiling = ref(false)
const internalErrorLine = ref(null)
const compileResult = ref(null)

const cmExtensions = computed(() => [
  nxslLanguage,
  ...themeExtensions.value,
  ...errorLineExtensions,
  EditorView.lineWrapping,
  // `editable` too: readOnly alone still takes focus and shows a caret.
  ...(props.readonly ? [EditorView.editable.of(false), EditorState.readOnly.of(true)] : []),
])

// 0.8125rem font-size * 1.5 line-height, plus padding
const editorMinHeight = computed(() => `calc(${props.rows} * 1.25rem + 0.75rem)`)

function handleReady({ view }) {
  cmView.value = view
}

function toggleTips(event) {
  tipsPopover.value.toggle(event)
}

const effectiveErrorLine = computed(() => internalErrorLine.value ?? props.errorLine)
watch(effectiveErrorLine, (line) => setError(cmView.value, line))

watch(
  () => props.modelValue,
  () => {
    internalErrorLine.value = null
    compileResult.value = null
  },
)

async function handleCompile() {
  if (!props.modelValue || compiling.value) return
  compiling.value = true
  internalErrorLine.value = null
  compileResult.value = null
  try {
    const result = await compileScript(props.modelValue)
    internalErrorLine.value = result.success ? null : (result.error?.lineNumber ?? null)
    compileResult.value = result
    emit('compile', result)
  } catch (err) {
    const result = { success: false, error: { message: err.message }, warnings: [] }
    compileResult.value = result
    emit('compile', result)
  } finally {
    compiling.value = false
  }
}

defineExpose({ cmView, setError: (line) => setError(cmView.value, line) })
</script>

<template>
  <div class="nxsl-script-editor">
    <div class="editor-container">
      <Transition name="hint-slide">
        <div v-if="hintExpanded">
          <div v-if="resolvedHint" class="hint-panel">
            <div class="hint-section-title">Variables</div>
            <div class="tips-table hint-table">
              <div v-for="v in resolvedHint.variables" :key="v.name" class="tip-row">
                <code>{{ v.name }}</code
                ><span>{{ v.desc }}</span>
              </div>
            </div>
            <div v-if="resolvedHint.returnValue" class="hint-return">
              <span class="hint-return-label">Return value:</span>
              <code>{{ resolvedHint.returnValue.value }}</code>
              <span class="hint-return-note">({{ resolvedHint.returnValue.note }})</span>
            </div>
          </div>
          <div v-else-if="hint" class="hint-panel">
            <pre class="hint-text">{{ hint }}</pre>
          </div>
        </div>
      </Transition>

      <div class="editor-wrap">
        <Codemirror
          :model-value="modelValue"
          :extensions="cmExtensions"
          :tab-size="2"
          :placeholder="placeholder"
          @ready="handleReady"
          @update:model-value="emit('update:modelValue', $event)"
        />

        <div class="editor-overlay">
          <div class="editor-toolbar">
            <div class="toolbar-buttons">
              <Button
                v-if="hasHint"
                v-tooltip.bottom="hintExpanded ? 'Hide hint' : 'Show hint'"
                :aria-label="hintExpanded ? 'Hide hint' : 'Show hint'"
                :aria-expanded="hintExpanded"
                icon="pi pi-info-circle"
                size="small"
                severity="secondary"
                text
                rounded
                :class="{ 'btn-active': hintExpanded }"
                @click="hintExpanded = !hintExpanded"
              />
              <Button
                v-tooltip.bottom="'NXSL quick reference'"
                aria-label="NXSL quick reference"
                icon="pi pi-question-circle"
                size="small"
                severity="secondary"
                text
                rounded
                @click="toggleTips"
              />
              <Button
                v-if="showCompile"
                icon="pi pi-check-circle"
                label="Compile"
                size="small"
                severity="secondary"
                outlined
                :disabled="!modelValue"
                :loading="compiling"
                @click="handleCompile"
              />
            </div>
          </div>
        </div>
      </div>

      <Transition name="diag-fade">
        <div v-if="compileResult && !compiling" class="compile-diagnostics">
          <div v-if="!compileResult.success" class="diag-error">
            <i class="pi pi-times-circle diag-icon" />
            <span>{{ compileResult.error?.message }}</span>
          </div>
          <template v-if="compileResult.warnings?.length">
            <div v-for="(w, i) in compileResult.warnings" :key="i" class="diag-warning">
              <i class="pi pi-exclamation-triangle diag-icon" />
              <span>Line {{ w.lineNumber }}: {{ w.message }}</span>
            </div>
          </template>
        </div>
      </Transition>
    </div>

    <Popover ref="tipsPopover">
      <div class="tips-content">
        <div class="tips-section">
          <div class="tips-title">Variables</div>
          <div class="tips-table">
            <div class="tip-row"><code>$varName</code><span>local variable</span></div>
            <div class="tip-row"><code>$1, $2, ...</code><span>script arguments</span></div>
            <div class="tip-row"><code>$ARGS</code><span>all arguments as array</span></div>
            <div class="tip-row"><code>$node</code><span>current node object</span></div>
          </div>
        </div>
        <div class="tips-section">
          <div class="tips-title">Common Functions</div>
          <div class="tips-table">
            <div class="tip-row"><code>print(text)</code><span>write to output</span></div>
            <div class="tip-row">
              <code>trace(level, text)</code><span>write to server log</span>
            </div>
            <div class="tip-row"><code>format(fmt, ...)</code><span>printf-style string</span></div>
            <div class="tip-row"><code>trim / length / substr</code><span>string ops</span></div>
            <div class="tip-row"><code>split / join</code><span>array ↔ string</span></div>
            <div class="tip-row"><code>upper / lower</code><span>case conversion</span></div>
            <div class="tip-row">
              <code>toInt / toReal / toString</code><span>type conversion</span>
            </div>
            <div class="tip-row"><code>isNull(v) / typeOf(v)</code><span>type checks</span></div>
          </div>
        </div>
        <div class="tips-section">
          <div class="tips-title">Operators</div>
          <div class="tips-table">
            <div class="tip-row"><code>..</code><span>string concatenation</span></div>
            <div class="tip-row"><code>=~</code><span>regex match</span></div>
            <div class="tip-row"><code>?.</code><span>safe navigation</span></div>
            <div class="tip-row"><code>and / or / not</code><span>logical operators</span></div>
          </div>
        </div>
        <div class="tips-section">
          <div class="tips-title">Editor Shortcuts</div>
          <div class="tips-table">
            <div class="tip-row"><code>Ctrl+/</code><span>toggle line comment</span></div>
            <div class="tip-row"><code>Ctrl+F</code><span>find</span></div>
            <div class="tip-row"><code>Ctrl+H</code><span>find & replace</span></div>
            <div class="tip-row"><code>Tab / Shift+Tab</code><span>indent / unindent</span></div>
            <div class="tip-row"><code>Ctrl+Z / Ctrl+Y</code><span>undo / redo</span></div>
          </div>
        </div>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
/* A flex-start column parent would otherwise shrink the editor to its longest line. */
.nxsl-script-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.editor-container {
  border: 1px solid var(--p-inputtext-border-color);
  border-radius: var(--p-inputtext-border-radius, 6px);
  overflow: hidden;
}

.hint-panel {
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
  padding: 0.5rem 0.75rem;
  overflow: hidden;
}

.hint-text {
  margin: 0;
  font-family: inherit;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: pre-wrap;
  line-height: 1.6;
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
  padding: 0.1rem 0;
}

.hint-return {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
}

.hint-return-label {
  color: var(--p-text-muted-color);
}

.hint-return-note {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
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
  position: relative;
  background: var(--p-surface-ground);
}

.editor-wrap :deep(.v-codemirror) {
  display: block;
}

.editor-wrap :deep(.cm-editor) {
  min-height: v-bind(editorMinHeight);
  font-size: 0.8125rem;
}

.editor-wrap :deep(.cm-scroller) {
  font-family: var(--font-mono);
}

/* cm-scroller's align-items: flex-start leaves height: 100% unresolvable. */
.editor-wrap :deep(.cm-gutters) {
  min-height: v-bind(editorMinHeight) !important;
}

.editor-wrap :deep(.cm-focused) {
  outline: none;
}

/* Passes clicks through in transparent areas */
.editor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

.editor-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0.375rem;
}

.toolbar-buttons {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.125rem;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--p-surface-900) 12%, transparent);
  pointer-events: auto;
}

.btn-active {
  color: var(--p-primary-color) !important;
}

.tips-content {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 0.25rem;
  max-width: 340px;
}

.tips-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.tips-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.tips-table {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tip-row {
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  font-size: 0.8125rem;
}

.tip-row code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--p-primary-color);
  background: var(--p-surface-ground);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.tip-row span {
  color: var(--p-text-muted-color);
}

.compile-diagnostics {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.4;
}

/* Border is on the children so it's clipped during the max-height transition */
.diag-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: color-mix(in srgb, var(--p-red-500) 8%, transparent);
  color: var(--p-red-500);
  border-top: 1px solid var(--p-surface-border);
}

.diag-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.3rem 0.625rem;
  background: color-mix(in srgb, var(--p-yellow-500) 8%, transparent);
  color: var(--p-yellow-600);
  border-top: 1px solid color-mix(in srgb, var(--p-yellow-500) 20%, transparent);
}

.diag-warning:first-child {
  border-top-color: var(--p-surface-border);
}

.diag-error + .diag-warning {
  border-top-color: var(--p-surface-border);
}

.diag-icon {
  flex-shrink: 0;
  margin-top: 0.1em;
  font-size: 0.75rem;
}

.diag-fade-enter-active,
.diag-fade-leave-active {
  transition:
    max-height 0.15s ease,
    opacity 0.15s ease;
  max-height: 10rem;
  overflow: hidden;
}

.diag-fade-enter-from,
.diag-fade-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
