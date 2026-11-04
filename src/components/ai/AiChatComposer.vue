<script setup>
/**
 * The message box of an AI assistant chat: the text, saved prompts, what the chat is about (the
 * `context` slot), how full the model's context window is, and Send.
 */
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useSavedPrompts, useCreateSavedPrompt } from '@/queries/useAiQueries'
import { contextUsageInfo } from '@/utils/aiChatDisplay'

const props = defineProps({
  /** While the assistant works: nothing new can be sent. */
  disabled: { type: Boolean, default: false },
  /** `{ tokens, window }` from the chat's last status, or null. */
  contextUsage: { type: Object, default: null },
  placeholder: { type: String, default: 'Ask something...' },
})

const emit = defineEmits(['send'])

const inputText = ref('')
const composerTextareaRef = ref(null)

// PrimeVue's autoResize compares against the last inline height it set, which goes stale once
// the CSS max-height cap applies, so it never shrinks back; resetting to 'auto' re-measures.
function resizeComposerTextarea() {
  const el = composerTextareaRef.value?.$el
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(inputText, () => nextTick(resizeComposerTextarea))

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.disabled) return
  inputText.value = ''
  emit('send', text)
}

function onComposerKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function focus() {
  composerTextareaRef.value?.$el?.focus()
}

defineExpose({ focus })

const usage = computed(() => contextUsageInfo(props.contextUsage))

const toast = useToast()
const { data: savedPromptsData } = useSavedPrompts()
const savedPrompts = computed(() => savedPromptsData.value ?? [])
const showPromptPicker = ref(false)
const promptPickerWrapRef = ref(null)

function onDocClick(e) {
  if (!promptPickerWrapRef.value?.contains(e.target)) {
    showPromptPicker.value = false
    document.removeEventListener('click', onDocClick)
  }
}

function togglePromptPicker() {
  if (showPromptPicker.value) {
    showPromptPicker.value = false
    document.removeEventListener('click', onDocClick)
  } else {
    showPromptPicker.value = true
    setTimeout(() => document.addEventListener('click', onDocClick), 0)
  }
}

function pickPrompt(prompt) {
  inputText.value = prompt.promptText
  showPromptPicker.value = false
  document.removeEventListener('click', onDocClick)
}

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})

const showSavePromptDialog = ref(false)
const savePromptForm = ref({ name: '', description: '' })
const savePromptNameError = ref(false)
const savePromptDialogError = ref(null)
const { mutate: createPrompt, isPending: isSavingPrompt } = useCreateSavedPrompt()

function openSavePromptDialog() {
  showPromptPicker.value = false
  document.removeEventListener('click', onDocClick)
  savePromptForm.value = { name: '', description: '' }
  savePromptNameError.value = false
  savePromptDialogError.value = null
  showSavePromptDialog.value = true
}

function confirmSavePrompt() {
  savePromptNameError.value = !savePromptForm.value.name.trim()
  if (savePromptNameError.value) return

  savePromptDialogError.value = null
  createPrompt(
    {
      name: savePromptForm.value.name.trim(),
      description: savePromptForm.value.description.trim() || null,
      promptText: inputText.value.trim(),
    },
    {
      onSuccess: () => {
        showSavePromptDialog.value = false
        toast.add({
          severity: 'success',
          summary: 'Prompt Saved',
          detail: `"${savePromptForm.value.name.trim()}" saved to your prompts.`,
          life: 3000,
        })
      },
      onError: (err) => {
        savePromptDialogError.value = err.message ?? 'Failed to save prompt.'
      },
    },
  )
}
</script>

<template>
  <div class="ai-composer">
    <Textarea
      ref="composerTextareaRef"
      v-model="inputText"
      rows="1"
      :placeholder="placeholder"
      aria-label="Message to the AI assistant"
      class="ai-composer-textarea"
      :disabled="disabled"
      @keydown="onComposerKeydown"
    />
    <div class="ai-composer-toolbar">
      <div ref="promptPickerWrapRef" class="prompt-picker-wrap">
        <Button
          icon="pi pi-bookmark"
          text
          severity="secondary"
          v-tooltip.top="'Pick a saved prompt'"
          aria-label="Pick saved prompt"
          :disabled="disabled"
          :class="{ 'picker-btn-active': showPromptPicker }"
          @click="togglePromptPicker"
        />
        <div v-if="showPromptPicker" class="prompt-picker-dropdown">
          <div class="prompt-picker-header">
            <span class="prompt-picker-title">Saved Prompts</span>
            <button
              class="prompt-picker-save-btn"
              :disabled="!inputText.trim() || disabled"
              @click="openSavePromptDialog"
            >
              <i class="pi pi-bookmark-fill" />
              Save current
            </button>
          </div>
          <div v-if="savedPrompts.length === 0" class="prompt-picker-empty">
            No saved prompts yet.
          </div>
          <button
            type="button"
            v-for="prompt in savedPrompts"
            :key="prompt.id"
            class="prompt-picker-item"
            @click="pickPrompt(prompt)"
          >
            <span class="prompt-picker-name">{{ prompt.name }}</span>
            <span v-if="prompt.description" class="prompt-picker-desc">{{
              prompt.description
            }}</span>
          </button>
        </div>
      </div>
      <span v-if="$slots.context" class="ai-composer-toolbar-separator" aria-hidden="true" />
      <slot name="context" />
      <div class="ai-composer-toolbar-spacer" />
      <div
        v-if="usage"
        class="ai-usage"
        :class="`ai-usage--${usage.level}`"
        v-tooltip.top="usage.tooltip"
        role="meter"
        :aria-valuenow="usage.percent ?? undefined"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="usage.tooltip"
      >
        <span v-if="usage.percent != null" class="ai-usage-bar">
          <span class="ai-usage-fill" :style="{ width: `${usage.percent}%` }" />
        </span>
        <span class="ai-usage-label">{{ usage.label }}</span>
      </div>
      <Button
        class="ai-send-btn"
        icon="pi pi-send"
        rounded
        aria-label="Send"
        :disabled="disabled || !inputText.trim()"
        @click="handleSend"
      />
    </div>

    <Dialog
      v-model:visible="showSavePromptDialog"
      header="Save as Prompt"
      modal
      :style="{ width: '28rem' }"
      :draggable="false"
    >
      <div class="save-prompt-body">
        <div class="save-prompt-field">
          <label for="sp-name">Name <span class="required-star">*</span></label>
          <InputText
            id="sp-name"
            v-model="savePromptForm.name"
            :class="{ 'p-invalid': savePromptNameError }"
            placeholder="Give this prompt a name"
            autofocus
            fluid
          />
          <small v-if="savePromptNameError" class="save-prompt-error">Name is required.</small>
        </div>
        <FormField class="save-prompt-field" label="Description" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="savePromptForm.description"
            placeholder="Optional description"
            fluid
          />
        </FormField>
        <FormField class="save-prompt-field" label="Prompt Text" group>
          <div class="save-prompt-preview">{{ inputText }}</div>
        </FormField>
        <MutationErrorState :error="savePromptDialogError" />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showSavePromptDialog = false" />
        <Button
          label="Save"
          severity="primary"
          :loading="isSavingPrompt"
          :disabled="isSavingPrompt"
          @click="confirmSavePrompt"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.ai-composer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 1rem;
  padding: 0.625rem 0.625rem 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.9rem;
  background: var(--p-surface-card);
  flex-shrink: 0;
  position: relative;
  transition: border-color 0.15s;
}

.ai-composer:focus-within {
  border-color: var(--p-primary-color);
}

.ai-composer-textarea {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0.375rem 0.375rem;
  line-height: 1.25rem;
  resize: none;
  overflow-y: auto;
  /* 18 lines cap: line-height * 18 + vertical padding */
  max-height: calc(1.25rem * 18 + 0.75rem);
}

.ai-composer-textarea:focus {
  box-shadow: none;
}

.ai-composer-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-composer-toolbar-separator {
  flex-shrink: 0;
  width: 1px;
  height: 1.25rem;
  margin-right: 0.25rem;
  background: var(--p-surface-border);
}

.ai-composer-toolbar-spacer {
  flex: 1;
}

.ai-send-btn {
  flex-shrink: 0;
}

.ai-usage {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

.ai-usage-bar {
  width: 3.5rem;
  height: 0.3125rem;
  border-radius: 999px;
  background: var(--p-surface-border);
  overflow: hidden;
}

.ai-usage-fill {
  display: block;
  height: 100%;
  background: var(--p-primary-color);
}

.ai-usage--major {
  color: var(--netxms-status-major-text);
}

.ai-usage--major .ai-usage-fill {
  background: var(--netxms-status-major);
}

.ai-usage--critical {
  color: var(--netxms-status-critical-text);
}

.ai-usage--critical .ai-usage-fill {
  background: var(--netxms-status-critical);
}

.prompt-picker-wrap {
  position: static;
}

.prompt-picker-wrap :deep(.picker-btn-active) {
  background: var(--p-button-text-secondary-active-background, var(--p-surface-hover));
  color: var(--p-primary-color);
}

.prompt-picker-dropdown {
  position: absolute;
  bottom: calc(100% + 0.25rem);
  left: 0.5rem;
  right: 0.5rem;
  max-width: 30rem;
  max-height: 16rem;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--p-popover-background, var(--p-surface-overlay));
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  box-shadow: 0 4px 16px color-mix(in srgb, #000 15%, transparent);
  z-index: 10;
}

.prompt-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  position: sticky;
  top: 0;
  background: var(--p-popover-background, var(--p-surface-overlay));
}

.prompt-picker-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.prompt-picker-empty {
  padding: 1rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  text-align: center;
}

.prompt-picker-item {
  /* A <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  transition: background-color 0.12s;
  min-width: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--p-surface-border);
}

.prompt-picker-item:last-child {
  border-bottom: none;
}

.prompt-picker-item:hover {
  background: var(--p-surface-hover);
}

.prompt-picker-name {
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-picker-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-picker-save-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm, 0.25rem);
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    background-color 0.12s,
    color 0.12s;
  white-space: nowrap;
}

.prompt-picker-save-btn:hover:not(:disabled) {
  background: var(--p-surface-hover);
  color: var(--p-text-color);
}

.prompt-picker-save-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.prompt-picker-save-btn .pi {
  font-size: 0.75rem;
}

.save-prompt-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}

.save-prompt-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.save-prompt-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.save-prompt-preview {
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  max-height: 6rem;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.save-prompt-error {
  color: var(--p-red-500);
  font-size: 0.8125rem;
}

.required-star {
  color: var(--p-red-500);
  margin-left: 0.125rem;
}
</style>
