<script setup>
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AiIconLabel from '@/components/ai/AiIconLabel.vue'
import AppLink from '@/components/common/AppLink.vue'
import RecordPanel from '@/components/common/RecordPanel.vue'
import {
  aiMessageStatus,
  aiMessageType,
  approvalPrompt,
  formatAiMessageExpiry,
  isAiMessageExpiringSoon,
  needsDecision,
} from '@/utils/aiMessageDisplay'
import { prefs } from '@/utils/appStorage'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import { objectTarget } from '@/utils/routeTargets'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

/**
 * One AI message in full. The list response already carries the text, so opening one costs no
 * request.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  /** A row of the Messages tab: the message plus `object` and `objectName`. */
  message: { type: Object, default: null },
  /** Epoch ms, so the deadline and the buttons follow the tab's clock. */
  now: { type: Number, default: () => Date.now() },
  /** An action is in flight. */
  pending: { type: Boolean, default: false },
  /** The message has expired or was deleted; `message` is the last copy seen. */
  unavailable: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'decide', 'delete'])

const WIDTH_FIELD = 'aiMessagePanelWidth'

// Off by product call. On, it shows what a task would run, which the AI writes separately from the
// text, so the two can disagree.
const SHOW_TASK_PROMPT = false

const width = ref(prefs.get(WIDTH_FIELD, 560))
watch(width, (px) => prefs.set(WIDTH_FIELD, px))

const type = computed(() => aiMessageType(props.message?.type))
const status = computed(() => aiMessageStatus(props.message, props.now))
const prompt = computed(() => (SHOW_TASK_PROMPT ? approvalPrompt(props.message) : ''))

const decidable = computed(() => !props.unavailable && needsDecision(props.message, props.now))
const deletable = computed(() => !props.unavailable && props.canDelete)

const expiresIn = computed(() => formatAiMessageExpiry(props.message, props.now))
const expiringSoon = computed(() => isAiMessageExpiringSoon(props.message, props.now))

const promptHeading = computed(() => {
  if (decidable.value) return 'If you approve'
  return props.message?.status === 'approved' ? 'Task started on approval' : 'Requested task'
})
</script>

<template>
  <RecordPanel
    v-model:width="width"
    :visible="visible"
    :title="type.panelTitle"
    :icon="type.icon"
    resize-label="Resize message panel"
    @update:visible="emit('update:visible', $event)"
  >
    <template v-if="message">
      <Message v-if="unavailable" severity="warn" :closable="false" class="message-gone">
        This message is no longer available. It has expired or was deleted.
      </Message>

      <h3 class="message-title">{{ message.title || 'Untitled message' }}</h3>

      <dl class="record-list">
        <div v-if="!unavailable" class="record-row">
          <dt class="record-label">Status</dt>
          <dd class="record-value"><AiIconLabel :display="status" /></dd>
        </div>
        <div v-if="message.relatedObjectId > 0" class="record-row">
          <dt class="record-label">Object</dt>
          <dd class="record-value">
            <AppLink v-if="message.object" :to="objectTarget(message.object)" class="object-link">
              {{ message.objectName }}
            </AppLink>
            <template v-else>{{ message.objectName }}</template>
          </dd>
        </div>
        <div class="record-row">
          <dt class="record-label">Created</dt>
          <dd class="record-value">
            {{ formatDateTime(message.creationTime) }}
            <span class="message-relative">{{ formatAgeCompact(message.creationTime, now) }}</span>
          </dd>
        </div>
        <div class="record-row">
          <dt class="record-label">Expires</dt>
          <dd class="record-value">
            {{ formatDateTime(message.expirationTime) }}
            <span class="message-relative" :class="{ 'message-expiry-soon': expiringSoon }">{{
              expiresIn
            }}</span>
          </dd>
        </div>
      </dl>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="ai-markdown message-text" v-html="renderCommentsMarkdown(message.text)" />

      <section v-if="prompt" class="message-section">
        <h4 class="record-label">{{ promptHeading }}</h4>
        <p v-if="decidable" class="message-hint">
          An AI task starts in the background, with your rights and this prompt:
        </p>
        <pre class="message-prompt">{{ prompt }}</pre>
      </section>
    </template>

    <template v-if="message && (decidable || deletable)" #footer>
      <Button
        v-if="deletable"
        label="Delete"
        icon="pi pi-trash"
        severity="danger"
        text
        size="small"
        class="message-delete"
        :disabled="pending"
        @click="emit('delete')"
      />
      <template v-if="decidable">
        <Button
          label="Reject"
          icon="pi pi-times"
          severity="secondary"
          outlined
          size="small"
          :disabled="pending"
          @click="emit('decide', 'rejected')"
        />
        <Button
          label="Approve"
          icon="pi pi-check"
          size="small"
          :disabled="pending"
          @click="emit('decide', 'approved')"
        />
      </template>
    </template>
  </RecordPanel>
</template>

<style src="@/assets/styles/ai-markdown.css" />

<style scoped>
.message-gone {
  margin-bottom: 0.75rem;
}

.message-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

/* `a.` to outrank AppLink's inherited color, whichever stylesheet loads first. */
a.object-link {
  color: var(--p-primary-color);
}

a.object-link:hover {
  text-decoration: underline;
}

.message-relative {
  margin-left: 0.375rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.message-relative.message-expiry-soon {
  font-weight: 600;
  color: var(--netxms-status-major);
}

.message-text {
  margin-top: 1.25rem;
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-word;
}

.message-section {
  margin-top: 1.25rem;
}

.message-section h4 {
  margin: 0 0 0.5rem;
}

.message-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.message-prompt {
  margin: 0;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-ground);
  font-family: var(--font-mono, monospace);
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-delete {
  margin-right: auto;
}
</style>
