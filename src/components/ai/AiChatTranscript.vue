<script setup>
/**
 * The scrolling message list of an AI assistant chat. State comes in from a `useAiChat`
 * instance; answers to a question go back out through `answer`.
 */
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import Button from 'primevue/button'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import {
  confirmationLabels,
  formatCountdown,
  functionDisplayName,
  secondsLeft,
} from '@/utils/aiChatDisplay'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{ id: number, role: string, content: string }>>} */
  messages: { type: Array, required: true },
  isThinking: { type: Boolean, default: false },
  pendingQuestion: { type: Object, default: null },
  currentFunction: { type: String, default: null },
  error: { type: String, default: null },
})

const emit = defineEmits(['answer'])

const scrollEl = ref(null)

watch(
  () => [props.messages.length, props.isThinking, props.pendingQuestion, props.error],
  () => {
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
    })
  },
)

/** "Getting alarm list..." while a function runs, "Thinking..." between calls. */
const thinkingLabel = computed(() =>
  props.currentFunction ? `${functionDisplayName(props.currentFunction)}...` : 'Thinking...',
)

// The server drops an unanswered question at `expiresAt` and the run carries on without the
// answer, so the buttons stop working then. Ticks only while a question is open.

const now = ref(Date.now())
let ticker = null

watch(
  () => props.pendingQuestion,
  (question) => {
    clearInterval(ticker)
    ticker = null
    now.value = Date.now()
    if (question?.expiresAt) ticker = setInterval(() => (now.value = Date.now()), 1000)
  },
  { immediate: true },
)

onUnmounted(() => clearInterval(ticker))

const remaining = computed(() =>
  props.pendingQuestion ? secondsLeft(props.pendingQuestion.expiresAt, now.value) : null,
)
const isExpired = computed(() => remaining.value === 0)

const labels = computed(() => confirmationLabels(props.pendingQuestion?.confirmationType))

function answer(payload) {
  if (!isExpired.value) emit('answer', payload)
}
</script>

<template>
  <div ref="scrollEl" class="ai-messages">
    <div class="ai-messages-column">
      <div v-if="messages.length === 0 && !isThinking" class="ai-empty-state">
        <i class="pi pi-sparkles ai-empty-icon" />
        <p>Ask me anything about your network infrastructure.</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="ai-bubble-wrap"
        :class="`ai-bubble-wrap--${msg.role}`"
      >
        <div v-if="msg.role === 'user'" class="ai-bubble ai-bubble--user">{{ msg.content }}</div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-else
          class="ai-bubble ai-bubble--assistant ai-markdown"
          v-html="renderCommentsMarkdown(msg.content)"
        />
      </div>

      <!-- Thinking indicator, naming the function the assistant is running, as legacy does. -->
      <div v-if="isThinking && !pendingQuestion" class="ai-bubble-wrap ai-bubble-wrap--assistant">
        <div class="ai-bubble ai-bubble--assistant ai-bubble--thinking" role="status">
          <span class="thinking-dot" />
          <span class="thinking-dot" />
          <span class="thinking-dot" />
          <span class="ai-thinking-label">{{ thinkingLabel }}</span>
        </div>
      </div>

      <!-- The assistant is blocked waiting on the user. Replaces the thinking dots, because
           it is the same state: the run has not finished, but nothing moves until we answer. -->
      <div v-if="pendingQuestion" class="ai-question" :class="{ 'is-expired': isExpired }">
        <div class="ai-question-header">The assistant is asking:</div>
        <div class="ai-question-text">{{ pendingQuestion.text }}</div>
        <div v-if="pendingQuestion.context" class="ai-question-context">
          {{ pendingQuestion.context }}
        </div>

        <div v-if="pendingQuestion.type === 'multipleChoice'" class="ai-question-options">
          <Button
            v-for="(option, index) in pendingQuestion.options ?? []"
            :key="index"
            :label="option"
            severity="secondary"
            outlined
            size="small"
            :disabled="isExpired"
            @click="answer({ positive: true, selectedOption: index })"
          />
        </div>
        <div v-else class="ai-question-options">
          <Button
            :label="labels.positive"
            size="small"
            :disabled="isExpired"
            @click="answer({ positive: true })"
          />
          <Button
            :label="labels.negative"
            severity="secondary"
            outlined
            size="small"
            :disabled="isExpired"
            @click="answer({ positive: false })"
          />
        </div>
        <div v-if="remaining != null" class="ai-question-timer">
          {{ isExpired ? 'Expired' : `Expires in ${formatCountdown(remaining)}` }}
        </div>
      </div>

      <div v-if="error" class="ai-error">
        <i class="pi pi-exclamation-triangle" />
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

/* The full-screen chat caps the column (--ai-chat-column-width); the panel fills its width. */
.ai-messages-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 100%;
  max-width: var(--ai-chat-column-width, none);
  margin: 0 auto;
}

.ai-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex: 1;
  color: var(--p-text-muted-color);
  text-align: center;
  padding: 2rem;
}

.ai-empty-icon {
  font-size: 2rem;
  opacity: 0.4;
}

.ai-empty-state p {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.ai-bubble-wrap {
  display: flex;
}

.ai-bubble-wrap--user {
  justify-content: flex-end;
}

.ai-bubble-wrap--assistant {
  justify-content: flex-start;
}

.ai-bubble {
  max-width: 85%;
  padding: 0.625rem 0.875rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-word;
}

.ai-bubble--user {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  border-bottom-right-radius: 0.25rem;
  white-space: pre-wrap;
}

.ai-bubble--assistant {
  background: var(--p-surface-card);
  color: var(--p-text-color);
  border: 1px solid var(--p-surface-border);
  border-bottom-left-radius: 0.25rem;
}

.ai-bubble--thinking {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.75rem 1rem;
}

.thinking-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--p-text-muted-color);
  animation: thinking-bounce 1.2s ease-in-out infinite;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}

.ai-thinking-label {
  margin-left: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

@keyframes thinking-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-0.375rem);
    opacity: 1;
  }
}

.ai-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--p-red-500) 15%, transparent);
  color: var(--p-red-500);
  font-size: 0.8125rem;
}

.ai-question {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--p-primary-color);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
}

.ai-question.is-expired {
  opacity: 0.6;
}

.ai-question-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
}

.ai-question-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.ai-question-context {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: pre-wrap;
}

.ai-question-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.125rem;
}

.ai-question-timer {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}
</style>

<style src="@/assets/styles/ai-markdown.css" />
