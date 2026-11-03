<script setup>
import { ref, computed, watch } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView } from '@codemirror/view'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Popover from 'primevue/popover'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import { useNxslLanguage } from '@/composables/useNxslLanguage'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'
import { useCodeMirrorErrorLine } from '@/composables/useCodeMirrorErrorLine'
import { useScript, useUpdateScript } from '@/queries/useScriptQueries'
import { compileScript } from '@/api/scriptApi'

const props = defineProps({
  scriptId: { type: Number, required: true },
})

const toast = useToast()

const { data: scriptData, isLoading } = useScript(computed(() => props.scriptId))

const form = ref({ name: '', code: '' })
const initialized = ref(false)

watch(
  () => props.scriptId,
  () => {
    initialized.value = false
    form.value = { name: '', code: '' }
  },
)

watch(
  () => scriptData.value,
  (data) => {
    if (data && !initialized.value) {
      form.value = { name: data.name, code: data.code ?? '' }
      initialized.value = true
    }
  },
  { immediate: true },
)

const isDirty = computed(
  () =>
    initialized.value &&
    (form.value.name !== scriptData.value?.name ||
      form.value.code !== (scriptData.value?.code ?? '')),
)

function discard() {
  if (scriptData.value) {
    form.value = { name: scriptData.value.name, code: scriptData.value.code ?? '' }
  }
}

defineExpose({
  get isDirty() {
    return isDirty.value
  },
  discard,
})

const { mutate: updateScript, isPending: isSaving } = useUpdateScript()

function save() {
  updateScript(
    { scriptId: props.scriptId, name: form.value.name, code: form.value.code },
    {
      onSuccess: () => {
        toast.add({ severity: 'success', summary: 'Script saved', life: 2000 })
        initialized.value = false
      },
      onError: (err) => {
        toast.add({ severity: 'error', summary: 'Save failed', detail: err.message, life: 4000 })
      },
    },
  )
}

const cmView = ref(null)
const { extensions: errorLineExtensions, setError } = useCodeMirrorErrorLine()
const nxslLanguage = useNxslLanguage()
const { themeExtensions } = useCodeMirrorTheme()

const cmExtensions = computed(() => [
  nxslLanguage,
  ...themeExtensions.value,
  ...errorLineExtensions,
  EditorView.lineWrapping,
])

function handleCmReady({ view }) {
  cmView.value = view
}

const compileResult = ref(null)
watch(
  () => form.value.code,
  () => {
    if (compileResult.value) {
      compileResult.value = null
      setError(cmView.value, null)
    }
  },
)

const isCompiling = ref(false)

async function compile() {
  if (!form.value.code || isCompiling.value) return
  isCompiling.value = true
  try {
    const result = await compileScript(form.value.code)
    compileResult.value = result
    setError(cmView.value, result.success ? null : (result.error?.lineNumber ?? null))
    if (result.success) {
      const warningCount = result.warnings?.length ?? 0
      toast.add({
        severity: 'success',
        summary: 'Compiled',
        detail: warningCount
          ? `Compiled with ${warningCount} warning${warningCount > 1 ? 's' : ''}`
          : 'Script compiled successfully.',
        life: 3000,
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Compilation failed',
        detail: result.error?.message,
        life: 4000,
      })
    }
  } catch (err) {
    compileResult.value = { success: false, error: { message: err.message }, warnings: [] }
    toast.add({ severity: 'error', summary: 'Compile failed', detail: err.message, life: 4000 })
  } finally {
    isCompiling.value = false
  }
}

const tipsPopover = ref()

function toggleTips(event) {
  tipsPopover.value.toggle(event)
}
</script>

<template>
  <div class="script-editor">
    <div class="editor-header">
      <div class="editor-header-left">
        <InputText
          v-if="!isLoading"
          v-model="form.name"
          class="name-input"
          size="small"
          placeholder="Script name"
        />
        <Skeleton v-else width="14rem" height="1.75rem" />
      </div>
      <div class="editor-header-actions">
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
          label="Compile"
          icon="pi pi-check-circle"
          size="small"
          severity="secondary"
          :disabled="isLoading || !form.code || isCompiling"
          :loading="isCompiling"
          @click="compile"
        />
        <Button
          label="Save"
          icon="pi pi-save"
          size="small"
          :disabled="!isDirty || isSaving"
          :loading="isSaving"
          @click="save"
        />
      </div>
    </div>

    <Transition name="diag-fade">
      <div v-if="compileResult" class="compile-diagnostics">
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

    <div class="editor-body">
      <div v-if="isLoading" class="editor-skeleton">
        <Skeleton v-for="i in 10" :key="i" height="1rem" class="code-skeleton-line" />
      </div>
      <Codemirror
        v-else
        v-model="form.code"
        :extensions="cmExtensions"
        :tab-size="2"
        placeholder="Enter NXSL script..."
        class="codemirror-wrapper"
        @ready="handleCmReady"
      />
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
.script-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.editor-header-left {
  flex: 1;
  min-width: 0;
}

.name-input {
  width: 100%;
  max-width: 28rem;
}

.editor-header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-skeleton {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.code-skeleton-line {
  border-radius: 3px;
}

.codemirror-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.codemirror-wrapper :deep(.v-codemirror) {
  height: 100%;
}

.codemirror-wrapper :deep(.cm-editor) {
  height: 100%;
  font-size: 0.8125rem;
}

.codemirror-wrapper :deep(.cm-scroller) {
  font-family: var(--font-mono);
}

.compile-diagnostics {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.4;
}

.diag-error {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: color-mix(in srgb, var(--p-red-500) 8%, transparent);
  color: var(--p-red-500);
  border-bottom: 1px solid var(--p-surface-border);
}

.diag-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.3rem 0.625rem;
  background: color-mix(in srgb, var(--p-yellow-500) 8%, transparent);
  color: var(--p-yellow-600);
  border-bottom: 1px solid color-mix(in srgb, var(--p-yellow-500) 20%, transparent);
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
</style>
