<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  /** From `pollExecutionStore.getExecution`; null before the first run. */
  execution: { type: Object, default: null },
  emptyHint: { type: String, required: true },
})

const outputRef = ref(null)

watch(
  () => [props.execution, props.execution?.lines.length],
  async () => {
    await nextTick()
    if (outputRef.value) outputRef.value.scrollTop = outputRef.value.scrollHeight
  },
)
</script>

<template>
  <div
    ref="outputRef"
    class="poll-output"
    :class="{ 'poll-output--empty': !execution?.lines.length }"
    data-testid="poll-output"
  >
    <span v-if="!execution?.lines.length" class="poll-empty-hint">{{ emptyHint }}</span>
    <div v-else class="poll-output-text">
      <div
        v-for="line in execution.lines"
        :key="line.id"
        class="poll-line"
        :class="line.level && `poll-line--${line.level}`"
      >
        <span class="poll-line-time">[{{ line.time }}]</span> {{ line.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.poll-output {
  flex: 1;
  overflow: auto;
  padding: 0.75rem;
  background: var(--p-surface-card);
  min-height: 0;
}

.poll-output--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.poll-empty-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.poll-output-text {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--p-text-color);
}

/* pre-wrap keeps the server's indentation, which nests the per-interface steps. */
.poll-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.poll-line-time {
  color: var(--p-text-muted-color);
}

.poll-line--info {
  color: var(--p-green-600);
}

.poll-line--warning {
  color: var(--p-orange-500);
}

.poll-line--error {
  color: var(--p-red-500);
}

.poll-line--local {
  color: var(--p-primary-color);
}
</style>
