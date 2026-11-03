<script setup>
import { ref, computed, watch, nextTick, defineAsyncComponent } from 'vue'
import Button from 'primevue/button'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Select from 'primevue/select'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { usePollExecutionStore } from '@/stores/pollExecutionStore'
import { usePollExecution } from '@/composables/usePollExecution'
import { useResizeHandle } from '@/composables/useResizeHandle'
import { formatTimeShort } from '@/utils/timeFormat'

// Async: this panel is always mounted, and a static import would put CodeMirror in the
// Dashboards and Network Maps route chunks.
const NxslScriptRunner = defineAsyncComponent(
  () => import('@/components/common/NxslScriptRunner.vue'),
)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  activeTab: { type: String, default: 'polls' },
  objectId: { type: Number, default: null },
  title: { type: String, default: 'Tools' },
  titleIcon: { type: String, default: 'pi pi-wrench' },
  polls: { type: Array, default: () => [] },
  objectLabel: { type: String, default: 'Object' },
})
const emit = defineEmits(['update:modelValue', 'update:activeTab'])

const panelWidth = ref(640)

const { isResizing, handleBindings: resizeBindings } = useResizeHandle({
  size: panelWidth,
  setSize: (px) => (panelWidth.value = px),
  min: 380,
  max: 1200,
  label: 'Resize tools panel',
})

const localTab = computed({
  get: () => props.activeTab,
  set: (v) => emit('update:activeTab', v),
})

// PrimeVue renders every TabPanel eagerly, so the CodeMirror runner waits until the tab is
// opened; a latch rather than v-if, so switching tabs keeps the script being written.
const scriptTabOpened = ref(false)
watch(
  [() => props.modelValue, localTab],
  ([isOpen, tab]) => {
    if (isOpen && tab === 'script') scriptTabOpened.value = true
  },
  { immediate: true },
)

const pollStore = usePollExecutionStore()
const { runPoll } = usePollExecution()
const pollOutputRef = ref(null)

const multiPoll = computed(() => props.polls.length > 1)
const selectedPollId = ref(props.polls[0]?.id ?? null)
const selectedPoll = computed(() => props.polls.find((p) => p.id === selectedPollId.value))

const pollEmptyHint = computed(() =>
  multiPoll.value
    ? 'Select a poll type and click "Run" to start.'
    : 'Click "Run" to start the poll.',
)

function pollExec(pollId) {
  return props.objectId ? pollStore.getExecution(`${props.objectId}-${pollId}`) : null
}
function isPollRunning(pollId) {
  return pollExec(pollId)?.status === 'running'
}
function pollStatusIcon(pollId) {
  const s = pollExec(pollId)?.status
  if (s === 'running') return 'pi pi-spin pi-spinner'
  if (s === 'completed') return 'pi pi-check-circle'
  if (s === 'error') return 'pi pi-times-circle'
  return null
}
function pollStatusClass(pollId) {
  const s = pollExec(pollId)?.status
  if (s === 'running') return 'status-running'
  if (s === 'completed') return 'status-ok'
  if (s === 'error') return 'status-err'
  return null
}
function pollLastRun(pollId) {
  const exec = pollExec(pollId)
  if (!exec) return null
  const time = formatTimeShort(exec.completedAt || exec.startedAt)
  if (exec.status === 'running') return `Started ${formatTimeShort(exec.startedAt)}`
  if (exec.status === 'completed') return `Completed ${time}`
  if (exec.status === 'error') return `Failed ${time}`
  return null
}
async function handleRunPoll() {
  const poll = selectedPoll.value
  if (!props.objectId || !poll) return
  await runPoll(
    { id: props.objectId, name: props.objectLabel, class: 'Container' },
    poll.id,
    poll.label,
  )
}

watch(
  () => pollExec(selectedPollId.value)?.streamOutput,
  async () => {
    await nextTick()
    if (pollOutputRef.value) pollOutputRef.value.scrollTop = pollOutputRef.value.scrollHeight
  },
)
</script>

<template>
  <div
    class="object-tools-panel"
    :class="{ 'is-open': modelValue, 'is-resizing': isResizing }"
    :style="{ width: `${panelWidth}px` }"
  >
    <div class="tools-resize-handle" v-bind="resizeBindings" />

    <div class="tools-panel-header">
      <span class="tools-panel-title">
        <i :class="titleIcon" />
        {{ title }}
      </span>
      <Button
        icon="pi pi-times"
        text
        severity="secondary"
        aria-label="Close"
        v-tooltip.bottom="'Close'"
        @click="emit('update:modelValue', false)"
      />
    </div>

    <Tabs v-model:value="localTab" class="tools-tabs">
      <TabList>
        <Tab value="polls"><i class="pi pi-chart-line tab-icon" />Polls</Tab>
        <Tab value="script"><i class="pi pi-code tab-icon" />Execute Script</Tab>
      </TabList>

      <TabPanels class="tools-tab-panels">
        <TabPanel value="polls" class="tools-tab-panel tools-tab-panel--polls">
          <UnderConstructionOverlay message="Coming soon">
            <div class="poll-row">
              <template v-if="multiPoll">
                <Select
                  v-model="selectedPollId"
                  :options="polls"
                  option-label="label"
                  option-value="id"
                  class="poll-select"
                  size="small"
                />
              </template>
              <template v-else>
                <i :class="[polls[0]?.icon, 'poll-type-icon']" />
                <span class="poll-label">{{ polls[0]?.label }} Poll</span>
              </template>
              <span v-if="pollLastRun(selectedPollId)" class="poll-last-run">
                {{ pollLastRun(selectedPollId) }}
              </span>
              <i
                v-if="pollStatusIcon(selectedPollId)"
                :class="[pollStatusIcon(selectedPollId), pollStatusClass(selectedPollId)]"
                class="poll-status-icon"
              />
              <Button
                label="Run"
                icon="pi pi-play"
                size="small"
                :disabled="isPollRunning(selectedPollId) || !objectId"
                :loading="isPollRunning(selectedPollId)"
                @click="handleRunPoll"
              />
            </div>

            <div
              ref="pollOutputRef"
              class="poll-output"
              :class="{ 'poll-output--empty': !pollExec(selectedPollId) }"
            >
              <template v-if="!pollExec(selectedPollId)">
                <span class="poll-empty-hint">{{ pollEmptyHint }}</span>
              </template>
              <template v-else>
                <pre class="poll-output-text">{{ pollExec(selectedPollId).streamOutput }}</pre>
                <div v-if="pollExec(selectedPollId).status === 'pending'" class="poll-status-line">
                  <i class="pi pi-spin pi-spinner" />
                  <span>Sending poll request...</span>
                </div>
                <div
                  v-if="pollExec(selectedPollId).status === 'error'"
                  class="poll-status-line poll-status-line--error"
                >
                  <i class="pi pi-times-circle" />
                  <span>{{ pollExec(selectedPollId).error }}</span>
                </div>
              </template>
            </div>
          </UnderConstructionOverlay>
        </TabPanel>

        <TabPanel value="script" class="tools-tab-panel tools-tab-panel--script">
          <NxslScriptRunner v-if="scriptTabOpened" :object-id="objectId" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.object-tools-panel {
  position: fixed;
  top: 58px;
  right: 0;
  height: calc(100vh - 58px);
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-overlay);
  border-left: 1px solid var(--p-surface-border);
  box-shadow: -4px 0 20px color-mix(in srgb, #000 18%, transparent);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  contain: strict;
}

.object-tools-panel.is-open {
  transform: translateX(0);
}

.object-tools-panel.is-resizing {
  transition: none;
}

.tools-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

/* The handle is a transparent strip, so focus reuses the hover fill; an outline would be
   clipped by the panel edge. */
.tools-resize-handle:hover,
.tools-resize-handle:focus-visible,
.is-resizing .tools-resize-handle {
  background: var(--p-primary-color);
  outline: none;
}

.tools-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.tools-panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
}

.tools-panel-title .pi {
  color: var(--p-primary-color);
}

.tools-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tab-icon {
  margin-right: 0.375rem;
}

.tools-tab-panels {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0px;
}

.tools-tab-panels :deep(.p-tabpanel) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.tools-tab-panel--polls {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.poll-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.poll-select {
  flex: 1;
  min-width: 0;
}

.poll-type-icon {
  color: var(--p-primary-color);
  font-size: 0.875rem;
}

.poll-label {
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
}

.poll-last-run {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.poll-status-icon {
  font-size: 0.875rem;
}

.status-running {
  color: var(--p-primary-color);
}

.status-ok {
  color: var(--p-green-500);
}

.status-err {
  color: var(--p-red-500);
}

.poll-output {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-ground);
  font-family: var(--font-mono);
}

.poll-output--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.poll-empty-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.poll-output-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--p-text-color);
}

.poll-status-line {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.poll-status-line--error {
  color: var(--p-red-500);
}

.tools-tab-panel--script {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.script-toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.script-options-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.script-library-select {
  flex: 1;
  min-width: 160px;
}

.script-params-input {
  flex: 1;
  min-width: 140px;
}

.script-editor-section {
  display: flex;
  flex-direction: column;
  flex: 3;
  min-height: 0;
}

.section-label-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.75rem;
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.section-label-bar--output {
  border-top: 2px solid var(--p-surface-border);
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.script-editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.script-editor-wrap :deep(.v-codemirror) {
  height: 100%;
}

.script-editor-wrap :deep(.cm-editor) {
  height: 100%;
  font-size: 0.8125rem;
}

.script-editor-wrap :deep(.cm-scroller) {
  font-family: var(--font-mono);
}

.script-output-section {
  display: flex;
  flex-direction: column;
  flex: 2;
  min-height: 0;
}

.script-output-content {
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

.output-placeholder {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
