<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorView } from '@codemirror/view'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Dialog from 'primevue/dialog'
import { useScriptStore } from '@/stores/scriptStore'
import { useCodeMirrorErrorLine } from '@/composables/useCodeMirrorErrorLine'
import { useNxslLanguage } from '@/composables/useNxslLanguage'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'

defineProps({
  objectId: { type: Number, default: null },
  showSave: { type: Boolean, default: false },
})

const scriptStore = useScriptStore()
const { extensions: errorLineExtensions, setError } = useCodeMirrorErrorLine()
const nxslLanguage = useNxslLanguage()
const { themeExtensions } = useCodeMirrorTheme()

const cmView = ref(null)
const outputRef = ref(null)

const cmExtensions = computed(() => [
  nxslLanguage,
  ...themeExtensions.value,
  ...errorLineExtensions,
  EditorView.lineWrapping,
])

function handleCmReady({ view }) {
  cmView.value = view
}

onMounted(() => {
  scriptStore.fetchLibrary()
})

watch(
  () => scriptStore.errorLine,
  (line) => {
    setError(cmView.value, line)
  },
)

watch(
  () => scriptStore.source,
  () => {
    if (scriptStore.compileResult || scriptStore.executionError) {
      scriptStore.compileResult = null
      scriptStore.executionError = null
      setError(cmView.value, null)
    }
  },
)

// Deep: streamed output grows the last entry in place, which a shallow watch never sees.
watch(
  () => scriptStore.output,
  async () => {
    await nextTick()
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  },
  { deep: true },
)

const saveAsVisible = ref(false)
const saveAsName = ref('')

function handleSaveAs() {
  saveAsName.value = ''
  saveAsVisible.value = true
}

async function confirmSaveAs() {
  if (!saveAsName.value.trim()) return
  await scriptStore.saveAs(saveAsName.value)
  saveAsVisible.value = false
}
</script>

<template>
  <div class="nxsl-script-runner">
    <div class="runner-toolbar">
      <div class="toolbar-start">
        <Button
          v-tooltip.bottom="'Execute script'"
          icon="pi pi-play"
          label="Execute"
          size="small"
          :disabled="!scriptStore.canExecute"
          :loading="scriptStore.executing"
          @click="scriptStore.execute(objectId)"
        />
        <Button
          v-tooltip.bottom="'Clear output and execute'"
          icon="pi pi-refresh"
          label="Clear & Execute"
          size="small"
          severity="secondary"
          :disabled="!scriptStore.canExecute"
          @click="scriptStore.clearAndExecute(objectId)"
        />
        <Button
          v-tooltip.bottom="
            scriptStore.stopping
              ? 'Waiting for the server to stop the script. Click again to disconnect.'
              : 'Stop execution'
          "
          icon="pi pi-stop"
          label="Stop"
          size="small"
          severity="danger"
          :disabled="!scriptStore.canStop"
          @click="scriptStore.stop()"
        />
        <Button
          v-tooltip.bottom="'Clear output'"
          icon="pi pi-eraser"
          label="Clear Output"
          size="small"
          severity="secondary"
          :disabled="!scriptStore.hasOutput"
          @click="scriptStore.clearOutput()"
        />
      </div>
      <div v-if="showSave" class="toolbar-end">
        <Button
          v-tooltip.bottom="'Save to library'"
          icon="pi pi-save"
          label="Save"
          size="small"
          severity="secondary"
          :disabled="!scriptStore.canSave"
          :loading="scriptStore.saving"
          @click="scriptStore.save()"
        />
        <Button
          v-tooltip.bottom="'Save as new script'"
          icon="pi pi-file-export"
          label="Save As"
          size="small"
          severity="secondary"
          :disabled="!scriptStore.source"
          @click="handleSaveAs"
        />
        <Button
          v-tooltip.bottom="'Clear source editor'"
          icon="pi pi-times"
          label="Clear Source"
          size="small"
          severity="secondary"
          :disabled="!scriptStore.source"
          @click="scriptStore.clearSource()"
        />
      </div>
    </div>

    <div class="runner-options">
      <div class="option-field">
        <label for="runner-library">Library</label>
        <Select
          id="runner-library"
          :model-value="scriptStore.selectedLibraryScript"
          :options="scriptStore.library"
          option-label="name"
          placeholder="Load from library..."
          :loading="scriptStore.loadingLibrary"
          class="library-select"
          @change="(e) => scriptStore.loadFromLibrary(e.value)"
        />
      </div>
      <div class="option-field">
        <label for="runner-params">Parameters</label>
        <InputText
          id="runner-params"
          v-model="scriptStore.parameters"
          placeholder="param1, param2, ..."
          class="params-input"
        />
      </div>
    </div>

    <div class="runner-editor-section">
      <div class="section-header">
        <span class="section-label">Source</span>
        <div class="section-header-actions">
          <i v-if="scriptStore.loadingScript" class="pi pi-spinner pi-spin" />
          <Button
            v-tooltip.bottom="'Compile script'"
            icon="pi pi-check-circle"
            label="Compile"
            size="small"
            severity="secondary"
            outlined
            :loading="scriptStore.compiling"
            :disabled="!scriptStore.source"
            @click="scriptStore.compile()"
          />
        </div>
      </div>
      <div class="editor-wrap">
        <Codemirror
          v-model="scriptStore.source"
          :extensions="cmExtensions"
          :tab-size="2"
          placeholder="Enter NXSL script..."
          @ready="handleCmReady"
        />
      </div>
    </div>

    <div class="runner-output-section">
      <div class="section-header">
        <span class="section-label">Output</span>
        <span v-if="scriptStore.executing" class="run-status">
          <template v-if="scriptStore.stopping">
            <i class="pi pi-spin pi-spinner" />
            Stopping...
          </template>
          <template v-else>
            <span class="run-status-dot" />
            Running
          </template>
        </span>
      </div>
      <div ref="outputRef" class="output-content">
        <template v-if="scriptStore.output.length">
          <div
            v-for="(entry, i) in scriptStore.output"
            :key="i"
            :class="['output-block', `output-${entry.type}`]"
          >
            <template v-if="entry.type === 'error'">
              <div class="error-header">
                <i class="pi pi-times-circle" />
                <span>{{ entry.reason }}</span>
              </div>
              <div v-if="entry.detail" class="error-detail">{{ entry.detail }}</div>
              <div v-if="entry.warnings?.length" class="warning-list">
                <div v-for="(w, wi) in entry.warnings" :key="wi" class="warning-row">
                  <i class="pi pi-exclamation-triangle" />
                  <span>Line {{ w.lineNumber }}: {{ w.message }}</span>
                </div>
              </div>
            </template>
            <template v-else-if="entry.type === 'info'">
              <div class="info-header">
                <i class="pi pi-check-circle" />
                <span>{{ entry.text }}</span>
              </div>
              <div v-if="entry.warnings?.length" class="warning-list">
                <div v-for="(w, wi) in entry.warnings" :key="wi" class="warning-row">
                  <i class="pi pi-exclamation-triangle" />
                  <span>Line {{ w.lineNumber }}: {{ w.message }}</span>
                </div>
              </div>
            </template>
            <div v-else-if="entry.type === 'stopped'" class="stopped-header">
              <i class="pi pi-stop-circle" />
              <span>{{ entry.text }}</span>
            </div>
            <template v-else-if="entry.type === 'result'">
              <div class="result-label">Result</div>
              <pre>{{ entry.text }}</pre>
            </template>
            <pre v-else>{{ entry.text }}</pre>
          </div>
        </template>
        <span v-else class="output-placeholder">Script output will appear here...</span>
      </div>
    </div>

    <Dialog
      v-if="showSave"
      v-model:visible="saveAsVisible"
      header="Save As New Script"
      :style="{ width: '24rem' }"
      modal
    >
      <div class="save-as-field">
        <label for="save-as-name">Script name</label>
        <InputText
          id="save-as-name"
          v-model="saveAsName"
          placeholder="my_script_name"
          class="save-as-input"
          autofocus
          @keydown.enter="confirmSaveAs"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" size="small" @click="saveAsVisible = false" />
        <Button
          label="Save"
          size="small"
          :disabled="!saveAsName.trim()"
          :loading="scriptStore.saving"
          @click="confirmSaveAs"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.nxsl-script-runner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.runner-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.toolbar-start,
.toolbar-end {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.runner-options {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-shrink: 0;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.option-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.option-field label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.library-select {
  width: 260px;
}

.params-input {
  width: 260px;
}

.runner-editor-section {
  display: flex;
  flex-direction: column;
  flex: 3;
  min-height: 0;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.editor-wrap :deep(.v-codemirror) {
  height: 100%;
}

.editor-wrap :deep(.cm-editor) {
  height: 100%;
  font-size: 0.8125rem;
}

.editor-wrap :deep(.cm-scroller) {
  font-family: var(--font-mono);
}

.runner-output-section {
  display: flex;
  flex-direction: column;
  flex: 2;
  min-height: 0;
  border-top: 2px solid var(--p-surface-border);
}

.output-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-ground);
}

.output-block + .output-block {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}

.output-block pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--p-text-color);
}

.output-error {
  margin: 0.375rem 0;
  padding: 0.5rem 0.625rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  border-left: 3px solid var(--p-red-500);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-red-500);
}

.error-detail {
  margin-top: 0.25rem;
  padding-left: 1.25rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--p-text-muted-color);
  white-space: pre-wrap;
}

.output-info {
  padding: 0.375rem 0.625rem;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-green-500);
}

.warning-list {
  margin-top: 0.25rem;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.warning-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-yellow-500);
}

.stopped-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.result-label {
  margin-bottom: 0.125rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.run-status {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--p-primary-color);
}

.run-status-dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--p-primary-color);
  animation: run-pulse 1s ease-in-out infinite;
}

@keyframes run-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

.output-placeholder {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.save-as-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.save-as-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.save-as-input {
  width: 100%;
}
</style>
