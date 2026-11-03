<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import AiChatTranscript from '@/components/ai/AiChatTranscript.vue'
import AiChatComposer from '@/components/ai/AiChatComposer.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { useLayout } from '@/composables/useLayout'
import { useAiChat } from '@/composables/useAiChat'
import { useResizeHandle } from '@/composables/useResizeHandle'
import { useObject } from '@/queries/useObjectQueries'
import { objectIdFromRoute } from '@/utils/routeTargets'

const { isAiChatOpen } = useLayout()
const {
  messages,
  isThinking,
  pendingQuestion,
  currentFunction,
  contextUsage,
  error,
  hasConversation,
  sendMessage,
  answerQuestion,
  clearMessages,
  exportChat,
  start,
} = useAiChat()

const panelWidth = ref(520)

watch(isAiChatOpen, (open) => {
  if (open) start()
})

// As in legacy, the open object goes with every question. From the route, not the selection
// store, which keeps the last tree object after leaving the object perspectives.
const route = useRoute()
const contextObjectId = computed(() => objectIdFromRoute(route))
const { data: contextObjectData } = useObject(() =>
  isAiChatOpen.value ? contextObjectId.value : null,
)
const contextObject = computed(() =>
  contextObjectData.value?.id === contextObjectId.value ? contextObjectData.value : null,
)
const chatContext = computed(() => {
  const id = contextObjectId.value
  if (id == null) return null
  const name = contextObject.value?.name
  return { type: 'object', object_id: id, ...(name ? { object_name: name } : {}) }
})

function handleSend(text) {
  sendMessage(text, chatContext.value)
}

const { isResizing, handleBindings: resizeBindings } = useResizeHandle({
  size: panelWidth,
  setSize: (px) => (panelWidth.value = px),
  min: 320,
  max: 900,
  label: 'Resize AI assistant panel',
})
</script>

<template>
  <div
    class="ai-chat-panel"
    :class="{ 'is-open': isAiChatOpen, 'is-resizing': isResizing }"
    :style="{ width: `${panelWidth}px` }"
  >
    <div class="ai-resize-handle" v-bind="resizeBindings" />

    <div class="ai-panel-header">
      <span class="ai-panel-title">
        <i class="pi pi-sparkles" />
        AI Assistant
      </span>
      <div class="ai-panel-actions">
        <Button
          icon="pi pi-download"
          text
          severity="secondary"
          v-tooltip.bottom="'Export chat'"
          aria-label="Export chat"
          :disabled="!hasConversation"
          @click="exportChat()"
        />
        <Button
          icon="pi pi-trash"
          text
          severity="secondary"
          v-tooltip.bottom="'Clear chat'"
          aria-label="Clear chat"
          :disabled="!hasConversation && !isThinking"
          @click="clearMessages"
        />
        <Button
          icon="pi pi-times"
          text
          severity="secondary"
          aria-label="Close"
          v-tooltip.bottom="'Close'"
          @click="isAiChatOpen = false"
        />
      </div>
    </div>

    <AiChatTranscript
      :messages="messages"
      :is-thinking="isThinking"
      :pending-question="pendingQuestion"
      :current-function="currentFunction"
      :error="error"
      @answer="answerQuestion"
    />

    <AiChatComposer :disabled="isThinking" :context-usage="contextUsage" @send="handleSend">
      <template #context>
        <div
          class="ai-context"
          v-tooltip.top="
            chatContext
              ? 'Sent with your messages, so the assistant knows what you are looking at'
              : 'Open an object to ask about it'
          "
        >
          <span class="ai-context-label">Context:</span>
          <template v-if="chatContext">
            <ObjectIcon v-if="contextObject" :object="contextObject" class="ai-context-icon" />
            <span class="ai-context-name">{{
              contextObject?.name ?? `[${chatContext.object_id}]`
            }}</span>
          </template>
          <span v-else class="ai-context-none">None</span>
        </div>
      </template>
    </AiChatComposer>
  </div>
</template>

<style scoped>
.ai-chat-panel {
  position: fixed;
  top: 58px;
  right: 0;
  height: calc(-58px + 100vh);
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

.ai-chat-panel.is-open {
  transform: translateX(0);
}

.ai-chat-panel.is-resizing {
  transition: none;
}

.ai-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
}

/* The handle is a transparent strip, so focus reuses the hover fill; an outline would be
   clipped by the panel edge. */
.ai-resize-handle:hover,
.ai-resize-handle:focus-visible,
.is-resizing .ai-resize-handle {
  background: var(--p-primary-color);
  outline: none;
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.ai-panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
}

.ai-panel-title .pi {
  color: var(--p-primary-color);
}

.ai-panel-actions {
  display: flex;
  gap: 0.125rem;
}

/* Context, in the composer toolbar */

.ai-context {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.ai-context-label,
.ai-context-none {
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.ai-context-icon {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
}

.ai-context-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
