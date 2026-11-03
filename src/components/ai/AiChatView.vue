<script setup>
/**
 * The AI perspective's full-screen chat (legacy `AiAssistantChatView`), a server-side chat of its
 * own. With an incident it is legacy's "Discuss with AI" chat, bound at creation, one per
 * incident. Chats live in `useAiChat`'s registry, so coming back finds the conversation as left.
 */
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import AppLink from '@/components/common/AppLink.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import AiChatTranscript from '@/components/ai/AiChatTranscript.vue'
import AiChatComposer from '@/components/ai/AiChatComposer.vue'
import { PERSPECTIVE_CHAT, incidentChatKey, useAiChat } from '@/composables/useAiChat'
import { useIncident } from '@/queries/useIncidentQueries'
import { aiTarget, incidentTarget } from '@/utils/routeTargets'

const props = defineProps({
  /** Bind the chat to this incident. The host keys the component by it. */
  incidentId: { type: Number, default: null },
})

const chat = useAiChat(
  props.incidentId != null ? incidentChatKey(props.incidentId) : PERSPECTIVE_CHAT,
  { incidentId: props.incidentId },
)
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
} = chat

const { data: incident } = useIncident(() => props.incidentId)

const title = computed(() =>
  props.incidentId != null ? `AI Assistant - Incident #${props.incidentId}` : 'AI Assistant',
)

const composerRef = ref(null)

onMounted(() => {
  chat.start()
  composerRef.value?.focus()
})
</script>

<template>
  <div class="ai-chat-view">
    <SectionHeader :title="title" icon="pi pi-sparkles">
      <template #actions>
        <Button
          v-tooltip.bottom="'Export chat'"
          icon="pi pi-download"
          text
          severity="secondary"
          size="small"
          aria-label="Export chat"
          :disabled="!hasConversation"
          @click="exportChat(title)"
        />
        <Button
          v-tooltip.bottom="'Clear chat'"
          icon="pi pi-trash"
          text
          severity="secondary"
          size="small"
          aria-label="Clear chat"
          :disabled="!hasConversation && !isThinking"
          @click="clearMessages"
        />
      </template>
    </SectionHeader>

    <!-- What an incident-bound chat is about, and the way back to the general one. -->
    <div v-if="incidentId != null" class="ai-chat-binding">
      <i class="pi pi-link" />
      <span class="ai-chat-binding-text">
        Discussing
        <AppLink :to="incidentTarget(incidentId)">incident #{{ incidentId }}</AppLink
        ><template v-if="incident?.title">: {{ incident.title }}</template>
      </span>
      <AppLink :to="aiTarget('chat')" class="ai-chat-binding-back">General chat</AppLink>
    </div>

    <AiChatTranscript
      :messages="messages"
      :is-thinking="isThinking"
      :pending-question="pendingQuestion"
      :current-function="currentFunction"
      :error="error"
      @answer="answerQuestion"
    />

    <div class="ai-chat-view-composer">
      <AiChatComposer
        ref="composerRef"
        :disabled="isThinking"
        :context-usage="contextUsage"
        :placeholder="incidentId != null ? 'Ask about this incident...' : 'Ask something...'"
        @send="sendMessage"
      />
    </div>
  </div>
</template>

<style scoped>
.ai-chat-view {
  /* The conversation reads as a column, not a line across a wide screen. */
  --ai-chat-column-width: 52rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

.ai-chat-binding {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-surface-card));
  font-size: 0.8125rem;
  flex-shrink: 0;
}

.ai-chat-binding .pi {
  color: var(--p-primary-color);
  flex-shrink: 0;
}

.ai-chat-binding-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-chat-binding-back {
  flex-shrink: 0;
}

.ai-chat-view-composer {
  width: 100%;
  max-width: calc(var(--ai-chat-column-width) + 2rem);
  margin: 0 auto;
}
</style>
