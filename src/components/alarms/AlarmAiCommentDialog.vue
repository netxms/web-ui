<script setup>
/**
 * Legacy "Ask AI assistant...": asks for a suggested comment on one alarm, which the user edits
 * and saves as a new alarm comment. Opening the dialog sends the request.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import FormField from '@/components/common/FormField.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import { labelForRight } from '@/auth/systemRights'
import { useAlarmAiComment, useCreateAlarmComment } from '@/queries/useAlarmQueries'
import { notifyAction } from '@/utils/notify'

// Async: AlarmTable is always mounted, and a static import would put CodeMirror in the Alarms,
// object and dashboard chunks.
const MarkdownCommentEditor = defineAsyncComponent(
  () => import('@/components/common/MarkdownCommentEditor.vue'),
)

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Only `id` and `message` are read. */
  alarm: { type: Object, default: null },
  sourceName: { type: String, default: '' },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const { mutateAsync: requestComment } = useAlarmAiComment()
const { mutateAsync: createComment, isPending: isSaving } = useCreateAlarmComment()

/** @type {import('vue').Ref<'asking'|'answered'|'failed'>} */
const phase = ref('asking')
const draft = ref('')
const failure = ref(null)
const elapsedSeconds = ref(0)
const editor = ref(null)

// The Cancel button that had focus is gone once the answer shows; the editor loads async.
watch(editor, (instance) => instance?.focus(), { flush: 'post' })

let controller = null
let ticker = null

function stopTicker() {
  clearInterval(ticker)
  ticker = null
}

/** The server finishes the request anyway; only its answer is dropped. */
function abandon() {
  controller?.abort()
  controller = null
  stopTicker()
}

async function ask() {
  abandon()
  const alarmId = props.alarm?.id
  if (alarmId == null) return
  const own = new AbortController()
  controller = own
  phase.value = 'asking'
  failure.value = null
  draft.value = ''
  elapsedSeconds.value = 0
  const started = Date.now()
  ticker = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - started) / 1000)
  }, 1000)
  try {
    const answer = await requestComment({ alarmId, signal: own.signal })
    if (own.signal.aborted) return
    draft.value = answer?.comment ?? ''
    phase.value = 'answered'
  } catch (error) {
    if (own.signal.aborted) return
    failure.value = error
    phase.value = 'failed'
  } finally {
    if (controller === own) {
      controller = null
      stopTicker()
    }
  }
}

watch(
  () => props.visible,
  (isVisible) => (isVisible ? ask() : abandon()),
  { immediate: true },
)
onBeforeUnmount(abandon)

const elapsedText = computed(() => {
  const seconds = elapsedSeconds.value
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

const forbiddenMessage = `Requires the "${labelForRight('useAiAssistant')}" system right and read access to this alarm and its source object.`

const failureView = computed(() => {
  const error = failure.value
  switch (error?.status) {
    case 403:
      return { forbidden: true }
    case 404:
      return { title: 'This alarm no longer exists.', retry: false }
    case 503:
      return {
        title: 'The AI assistant is not available.',
        detail: 'The server has no AI provider it can reach, or the assistant gave no answer.',
        retry: true,
      }
    case 504:
      return {
        title: 'The AI assistant did not answer in time.',
        detail: 'Looking up data for this alarm took longer than the server waits.',
        retry: true,
      }
    default:
      return { title: 'Cannot query AI assistant', detail: error?.message, retry: true }
  }
})

const canSave = computed(() => draft.value.trim().length > 0)

function close() {
  emit('update:visible', false)
}

async function save() {
  const text = draft.value.trim()
  if (!text || props.alarm?.id == null) return
  try {
    await createComment({ alarmId: props.alarm.id, text })
    close()
    notifyAction('Comment added', 'pi pi-comment')
  } catch (e) {
    toast.add({
      severity: 'error',
      summary: 'Failed to save comment',
      detail: e?.message,
      life: 4000,
    })
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="AI Assistant Comment"
    modal
    :closable="!isSaving"
    :draggable="false"
    :style="{ width: '52rem' }"
    :breakpoints="{ '900px': '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="ai-comment-body">
      <p v-if="alarm" class="ai-comment-alarm" :title="alarm.message">
        <span v-if="sourceName" class="ai-comment-source">{{ sourceName }}</span>
        {{ alarm.message }}
      </p>

      <div v-if="phase === 'asking'" class="ai-comment-asking" role="status">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <div class="ai-comment-asking-text">
          <span>Querying AI assistant…</span>
          <span class="ai-comment-hint">
            The assistant may look up more data first, which can take a few minutes.
          </span>
        </div>
        <span class="ai-comment-elapsed" aria-hidden="true">{{ elapsedText }}</span>
      </div>

      <FormField v-else-if="phase === 'answered'" label="Comment" group>
        <div class="ai-comment-editor">
          <MarkdownCommentEditor ref="editor" v-model="draft" initial-mode="preview" fill />
        </div>
      </FormField>

      <template v-else>
        <RestrictedState v-if="failureView.forbidden" :message="forbiddenMessage" />
        <Message v-else severity="error" :closable="false">
          <div class="ai-comment-failure">
            <span class="ai-comment-failure-title">{{ failureView.title }}</span>
            <span v-if="failureView.detail">{{ failureView.detail }}</span>
          </div>
        </Message>
      </template>
    </div>

    <template #footer>
      <Button v-if="phase === 'asking'" label="Cancel" text severity="secondary" @click="close" />
      <template v-else-if="phase === 'answered'">
        <Button label="Discard" text severity="secondary" :disabled="isSaving" @click="close" />
        <Button
          label="Save comment"
          icon="pi pi-check"
          :loading="isSaving"
          :disabled="!canSave"
          @click="save"
        />
      </template>
      <template v-else>
        <Button label="Close" text severity="secondary" @click="close" />
        <Button v-if="failureView.retry" label="Try again" icon="pi pi-refresh" @click="ask" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.ai-comment-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.ai-comment-alarm {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  word-break: break-word;
}

.ai-comment-source {
  margin-inline-end: 0.375rem;
  color: var(--p-text-color);
  font-weight: 600;
}

.ai-comment-asking {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1.5rem 0.25rem;
}

.ai-comment-asking .pi-spinner {
  margin-top: 0.125rem;
  color: var(--p-primary-color);
}

.ai-comment-asking-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.ai-comment-hint {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.ai-comment-elapsed {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

/* Fixed, so the editor's toolbar stays in view and the text scrolls under it. */
.ai-comment-editor {
  display: flex;
  flex-direction: column;
  height: min(30rem, 60vh);
}

.ai-comment-failure {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ai-comment-failure-title {
  font-weight: 600;
}
</style>
