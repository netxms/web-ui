<script setup>
/**
 * Screenshot of a node's Windows desktop, taken through the agent. Unlike the legacy view the
 * session is typed, not discovered: the WebAPI cannot read the `Agent.SessionAgents` table.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ToggleSwitch from 'primevue/toggleswitch'
import FormField from '@/components/common/FormField.vue'
import { takeScreenshot } from '@/api/objectsApi'
import { safeFilename } from '@/utils/csvExport'

const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
  /** Blank lets the server pick the console session. */
  sessionName: { type: String, default: '' },
})

const emit = defineEmits(['update:visible'])

const AUTO_REFRESH_MS = 10_000

const session = ref('')
const imageUrl = ref(null)
const capturedAt = ref(null)
const isCapturing = ref(false)
const errorMessage = ref(null)
const autoRefresh = ref(false)

let timer = null
/** Guards against an in-flight capture landing after a newer one, or after close. */
let captureToken = 0

function releaseImage() {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
  }
}

async function capture() {
  if (!props.object?.id) return
  const token = ++captureToken
  isCapturing.value = true
  errorMessage.value = null
  try {
    const blob = await takeScreenshot(props.object.id, { sessionName: session.value.trim() })
    if (token !== captureToken) return
    releaseImage()
    imageUrl.value = URL.createObjectURL(blob)
    capturedAt.value = new Date()
  } catch (error) {
    if (token !== captureToken) return
    // The agent reports e.g. "no session agent running" as a 500 with a reason.
    errorMessage.value = error?.message || 'Could not take a screenshot.'
    releaseImage()
    // A failure repeating on every refresh is just noise.
    autoRefresh.value = false
  } finally {
    if (token === captureToken) isCapturing.value = false
  }
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(autoRefresh, (on) => {
  stopTimer()
  if (on) timer = setInterval(capture, AUTO_REFRESH_MS)
})

watch(
  () => props.visible,
  (open) => {
    if (open) {
      session.value = props.sessionName ?? ''
      errorMessage.value = null
      capturedAt.value = null
      capture()
    } else {
      // The blob URL leaks for the life of the document unless revoked.
      captureToken++
      autoRefresh.value = false
      stopTimer()
      releaseImage()
      isCapturing.value = false
    }
  },
)

onBeforeUnmount(() => {
  stopTimer()
  releaseImage()
})

function save() {
  if (!imageUrl.value) return
  const stamp = (capturedAt.value ?? new Date()).toISOString().slice(0, 19).replaceAll(/[:T]/g, '')
  const link = document.createElement('a')
  link.href = imageUrl.value
  link.download = `${safeFilename(props.object?.name, 'node')}_screenshot_${stamp}.png`
  document.body.append(link)
  link.click()
  link.remove()
}

const capturedLabel = computed(() =>
  capturedAt.value ? capturedAt.value.toLocaleTimeString() : null,
)

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Screenshot — ${object?.name ?? ''}`"
    modal
    :style="{ width: '56rem', maxWidth: '95vw' }"
    @update:visible="$event || close()"
  >
    <div class="screenshot-body">
      <div class="screenshot-controls">
        <FormField label="Session" class="session-field" group>
          <InputText
            v-model="session"
            placeholder="Console"
            size="small"
            aria-label="Session name"
            @keyup.enter="capture"
          />
        </FormField>
        <Button
          label="Capture"
          icon="pi pi-camera"
          size="small"
          :loading="isCapturing"
          @click="capture"
        />
        <FormField label="Auto-refresh" class="auto-field" group>
          <ToggleSwitch v-model="autoRefresh" aria-label="Refresh every ten seconds" />
        </FormField>
        <span v-if="capturedLabel" class="captured-at">Taken at {{ capturedLabel }}</span>
      </div>

      <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>

      <div class="screenshot-stage">
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="`Desktop of ${object?.name ?? 'node'}`"
          class="screenshot-image"
        />
        <div v-else-if="isCapturing" class="stage-placeholder">
          <i class="pi pi-spin pi-spinner" aria-hidden="true" />
          <span>Taking screenshot…</span>
        </div>
        <div v-else-if="!errorMessage" class="stage-placeholder">
          <i class="pi pi-desktop" aria-hidden="true" />
          <span>No screenshot yet.</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="Save as PNG"
        icon="pi pi-download"
        severity="secondary"
        outlined
        :disabled="!imageUrl"
        @click="save"
      />
      <Button label="Close" @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.screenshot-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.screenshot-controls {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
}

.session-field {
  max-width: 16rem;
}

.auto-field :deep(.form-field__label),
.session-field :deep(.form-field__label) {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.captured-at {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  padding-bottom: 0.4rem;
}

.screenshot-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 18rem;
  max-height: 60vh;
  overflow: auto;
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
}

.screenshot-image {
  max-width: 100%;
  height: auto;
  display: block;
}

.stage-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.stage-placeholder i {
  font-size: 1.75rem;
  opacity: 0.5;
}
</style>
