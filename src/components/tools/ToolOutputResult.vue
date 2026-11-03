<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useToolExecution } from '@/composables/useToolExecution'
import { formatTimeShort } from '@/utils/timeFormat'

const props = defineProps({
  execution: {
    type: Object,
    required: true,
  },
})

const { reExecute, terminateStream } = useToolExecution()
const outputRef = ref(null)

const isLoading = computed(
  () => props.execution.status === 'pending' || props.execution.status === 'running',
)
const hasError = computed(() => props.execution.status === 'error')
const isStreaming = computed(
  () => props.execution.status === 'running' && !!props.execution.streamOutput,
)
const showCompleted = computed(
  () => props.execution.status === 'completed' && !props.execution.terminatedByUser,
)

const output = computed(() => {
  if (isStreaming.value) return props.execution.streamOutput

  const result = props.execution.result
  if (result === null || result === undefined) return ''
  if (typeof result === 'object' && result.type === 'text') return result.output || ''
  if (typeof result === 'object' && result.type === 'none') return '(no output)'
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
})

watch(output, async () => {
  await nextTick()
  if (outputRef.value) {
    outputRef.value.scrollTop = outputRef.value.scrollHeight
  }
})

function handleReExecute() {
  reExecute(props.execution.id)
}
</script>

<template>
  <div class="tool-output">
    <div class="tool-output-header">
      <div class="tool-output-info">
        <span class="tool-output-name">{{ execution.toolName }}</span>
        <span class="tool-output-object">on {{ execution.objectName }}</span>
        <span v-if="execution.startedAt" class="tool-output-time">
          {{ formatTimeShort(execution.startedAt) }}
        </span>
        <span v-if="isStreaming" class="tool-output-streaming-badge">
          <span class="streaming-dot" />
          Streaming
        </span>
      </div>
      <div class="tool-output-actions">
        <Button
          v-tooltip.bottom="'Terminate'"
          aria-label="Terminate"
          icon="pi pi-stop"
          text
          severity="danger"
          size="small"
          :disabled="!execution.isStreaming"
          @click="terminateStream(execution.id)"
        />
        <Button
          v-tooltip.bottom="'Run again'"
          aria-label="Run again"
          icon="pi pi-replay"
          text
          severity="secondary"
          size="small"
          :disabled="isLoading"
          @click="handleReExecute"
        />
      </div>
    </div>

    <div ref="outputRef" class="tool-output-content">
      <div v-if="isLoading && !output" class="tool-output-loading">
        <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
        <span>Executing...</span>
      </div>

      <pre v-if="output" class="tool-output-text">{{ output }}</pre>

      <div v-if="showCompleted" class="tool-output-completed">
        <i class="pi pi-check-circle" />
        <span>Completed</span>
      </div>

      <div v-if="hasError" class="tool-output-error">
        <i class="pi pi-exclamation-triangle" />
        <span>{{ execution.error }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-output {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tool-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.tool-output-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.tool-output-name {
  font-weight: 600;
  color: var(--p-text-color);
}

.tool-output-object {
  color: var(--p-text-muted-color);
}

.tool-output-time {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.tool-output-streaming-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--p-primary-color);
}

.streaming-dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--p-primary-color);
  animation: stream-pulse 1s ease-in-out infinite;
}

@keyframes stream-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

.tool-output-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tool-output-content {
  flex: 1;
  overflow: auto;
  padding: 0.75rem;
  background: var(--p-surface-card);
  min-height: 0;
}

.tool-output-loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  padding: 0.5rem 0;
}

.tool-output-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--p-text-color);
}

.tool-output-completed {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--p-green-500);
}

.tool-output-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-top: 0.5rem;
  border-radius: 0.25rem;
  background: var(--p-red-50);
  color: var(--p-red-700);
  font-size: 0.8125rem;
}

.tool-output-error i {
  flex-shrink: 0;
  margin-top: 0.125rem;
}
</style>
