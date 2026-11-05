<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useConfirm } from 'primevue/useconfirm'
import SshConnectPanel from '@/components/ssh-terminal/SshConnectPanel.vue'
import { useTheme } from '@/composables/useTheme'
import { useObject } from '@/queries/useObjectQueries'
import { useSshTerminalStore } from '@/stores/sshTerminalStore'
import { userPrefs } from '@/utils/appStorage'
import { notify } from '@/utils/notify'
import {
  MAX_PASTE_BYTES,
  classifyPaste,
  findConnection,
  rememberConnection,
  storedCredentialsState,
} from '@/utils/sshTerminalProtocol'

const CONNECTIONS_PREF = 'sshTerminal.connections'
const FONT_SIZE_PREF = 'sshTerminal.fontSize'
const DEFAULT_FONT_SIZE = 14
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 24
const RESIZE_DEBOUNCE_MS = 120

const props = defineProps({
  object: { type: Object, required: true },
  sessionKey: { type: String, required: true },
})

const store = useSshTerminalStore()
const confirm = useConfirm()
const { isDark } = useTheme()

const controller = store.controller(props.sessionKey)
const session = controller.state
const phase = computed(() => session.phase)
const onForm = computed(
  () => phase.value === 'idle' || (phase.value === 'connecting' && !session.hadSession),
)

const { data: details, isError: detailsFailed } = useObject(() => props.object.id)
// The tree's summary has the name, class and rights; only the full document has the SSH fields.
const nodeDocument = computed(() => details.value ?? props.object)
const nodeLoaded = computed(() => !!details.value || detailsFailed.value)

const rootRef = ref(null)
const hostRef = ref(null)
const panelRef = ref(null)
const findInputRef = ref(null)
const attached = ref(false)

const fontSize = ref(userPrefs.get(FONT_SIZE_PREF, DEFAULT_FONT_SIZE))

// The Clipboard API read exists only on HTTPS, and the browser's own paste works everywhere.
const canReadClipboard = !!navigator.clipboard?.readText

// Connecting

function readRemembered() {
  return findConnection(userPrefs.get(CONNECTIONS_PREF), props.object.id)
}

const remembered = ref(readRemembered())

function connectWith(form) {
  userPrefs.set(
    CONNECTIONS_PREF,
    rememberConnection(userPrefs.get(CONNECTIONS_PREF), props.object.id, form),
  )
  remembered.value = readRemembered()
  controller.connect(
    form.mode === 'stored'
      ? { login: null }
      : { login: form.login, password: form.password, keyId: form.keyId },
  )
}

function cancelConnect() {
  session.autoConnect = false
  controller.disconnect()
}

// From the menu: straight in when there are stored credentials to use, otherwise the form.
watch(
  [() => session.autoConnect, nodeLoaded, attached],
  ([autoConnect, loaded, ready]) => {
    if (!autoConnect || !loaded || !ready) return
    session.autoConnect = false
    if (
      storedCredentialsState(nodeDocument.value) === 'known' &&
      remembered.value?.mode !== 'custom'
    ) {
      // The menu that brought the user here hands focus back to its button otherwise.
      rootRef.value?.focus({ preventScroll: true })
      connectWith({ mode: 'stored' })
    }
  },
  { immediate: true },
)

const LIVE_ACTION = {
  connecting: { label: 'Cancel', icon: 'pi pi-times' },
  reconnecting: { label: 'Stop', icon: 'pi pi-times' },
  connected: { label: 'Disconnect', icon: 'pi pi-power-off' },
}

const statusText = computed(() => {
  switch (phase.value) {
    case 'connecting':
      return `Connecting to ${session.objectName}...`
    case 'connected':
      return session.usesStored
        ? 'Connected with the stored credentials'
        : `Connected as ${session.login}`
    case 'reconnecting':
      return `Connection lost. Reconnecting, attempt ${session.attempt}...`
    default:
      return session.message?.title ?? ''
  }
})

const statusDetail = computed(() =>
  phase.value === 'ended' ? (session.message?.detail ?? '') : '',
)

// Toolbar

function focusTerminal() {
  controller.emulator?.focus()
}

function clearTerminal() {
  controller.emulator?.clear()
  focusTerminal()
}

async function copySelection() {
  const copied = await controller.emulator?.copySelection()
  if (copied === false) {
    notify({ severity: 'error', summary: 'Could not copy', detail: 'The browser refused it.' })
  }
  focusTerminal()
}

function changeFontSize(step) {
  const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize.value + step))
  fontSize.value = next
  userPrefs.set(FONT_SIZE_PREF, next)
}

watch(fontSize, (size) => {
  controller.emulator?.setFontSize(size)
  controller.resize()
})

watch(userPrefs.revision, () => {
  fontSize.value = userPrefs.get(FONT_SIZE_PREF, DEFAULT_FONT_SIZE)
  remembered.value = readRemembered()
})

watch(isDark, (dark) => controller.emulator?.setDark(dark))

// Paste

function pasteApproved(text) {
  controller.emulator?.paste(text)
  focusTerminal()
}

/** Each line break in a paste runs what came before it, on what may be a production router. */
function requestPaste(text) {
  const { action, lines } = classifyPaste(text, {
    bracketed: !!controller.emulator?.bracketedPaste,
  })
  if (action === 'paste') {
    pasteApproved(text)
    return
  }
  if (action === 'reject') {
    notify({
      severity: 'warn',
      summary: 'Too much text to paste',
      detail: `The limit is ${MAX_PASTE_BYTES / 1024} KB, because the SSH proxy agent can lose the rest without saying so.`,
      life: 6000,
    })
    return
  }
  confirm.require({
    header: 'Paste into the terminal?',
    message:
      lines > 1
        ? `This pastes ${lines} lines into ${session.objectName}, and each one runs as it arrives.`
        : `This text ends with a line break, so it runs on ${session.objectName} as soon as it is pasted.`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Paste',
    rejectLabel: 'Cancel',
    accept: () => pasteApproved(text),
    reject: focusTerminal,
  })
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) requestPaste(text)
    else focusTerminal()
  } catch {
    notify({
      severity: 'warn',
      summary: 'The browser did not allow reading the clipboard',
      detail: 'Press Ctrl+Shift+V in the terminal, or use its right-click menu.',
      life: 6000,
    })
    focusTerminal()
  }
}

// Find

const findOpen = ref(false)
const findText = ref('')

async function openFind() {
  findOpen.value = true
  await nextTick()
  findInputRef.value?.$el?.focus()
  findInputRef.value?.$el?.select()
}

function closeFind() {
  findOpen.value = false
  controller.emulator?.clearFind()
  focusTerminal()
}

function findNext() {
  if (findText.value) controller.emulator?.findNext(findText.value)
}

function findPrevious() {
  if (findText.value) controller.emulator?.findPrevious(findText.value)
}

// Terminal in the page

let resizeObserver = null
let resizeTimer = null

function scheduleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => controller.resize(), RESIZE_DEBOUNCE_MS)
}

/** A reconnect must not pull focus out of a field the user moved to in the meantime. */
function focusIsFree() {
  const active = document.activeElement
  return !active || active === document.body || !!rootRef.value?.contains(active)
}

onMounted(async () => {
  await controller.attach(
    hostRef.value,
    { onPaste: requestPaste, onFind: openFind },
    (emulator) => {
      emulator.setDark(isDark.value)
      emulator.setFontSize(fontSize.value)
    },
  )
  // Unmounted while xterm.js was loading.
  if (!hostRef.value) return
  attached.value = true
  resizeObserver = new ResizeObserver(scheduleResize)
  resizeObserver.observe(hostRef.value)
  if (phase.value !== 'idle') focusTerminal()
})

// After the update: until then the terminal is still hidden behind the form and cannot take focus.
watch(
  phase,
  (current) => {
    if (current !== 'connected') return
    panelRef.value?.forgetPassword()
    if (focusIsFree()) focusTerminal()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearTimeout(resizeTimer)
  controller.detach()
})
</script>

<template>
  <div ref="rootRef" class="ssh-terminal-view" tabindex="-1">
    <!-- Laid out behind the form too: the server needs the real size before it connects. -->
    <div class="ssh-toolbar" :class="{ 'ssh-behind': onForm }">
      <div class="ssh-status" role="status">
        <span
          class="ssh-status-dot"
          :class="`ssh-status-dot--${session.message?.severity === 'error' ? 'error' : phase}`"
        />
        <span class="ssh-status-text">
          <span :class="{ 'ssh-status-error': session.message?.severity === 'error' }">
            {{ statusText }}
          </span>
          <span v-if="statusDetail" class="ssh-status-detail">{{ statusDetail }}</span>
        </span>
      </div>

      <div class="ssh-actions">
        <template v-if="phase === 'ended'">
          <Button
            label="Reconnect"
            icon="pi pi-refresh"
            size="small"
            @click="controller.reconnect()"
          />
          <Button
            label="Change login"
            icon="pi pi-user-edit"
            text
            severity="secondary"
            size="small"
            @click="controller.showForm()"
          />
        </template>
        <Button
          v-else
          :label="LIVE_ACTION[phase]?.label"
          :icon="LIVE_ACTION[phase]?.icon"
          text
          severity="secondary"
          size="small"
          @click="controller.disconnect()"
        />

        <span class="ssh-actions-divider" />

        <Button
          v-tooltip.bottom="'Copy selection (Ctrl+Shift+C). Ctrl+C goes to the shell.'"
          aria-label="Copy selection"
          icon="pi pi-copy"
          text
          severity="secondary"
          size="small"
          :disabled="!session.hasSelection"
          @click="copySelection"
        />
        <Button
          v-if="canReadClipboard"
          v-tooltip.bottom="'Paste (Ctrl+Shift+V)'"
          aria-label="Paste"
          icon="pi pi-clipboard"
          text
          severity="secondary"
          size="small"
          :disabled="phase !== 'connected'"
          @click="pasteFromClipboard"
        />
        <Button
          v-tooltip.bottom="'Find in scrollback (Ctrl+Shift+F)'"
          aria-label="Find in scrollback"
          icon="pi pi-search"
          text
          severity="secondary"
          size="small"
          @click="openFind"
        />
        <Button
          v-tooltip.bottom="'Clear the screen and scrollback here. Nothing is sent to the node.'"
          aria-label="Clear terminal"
          icon="pi pi-eraser"
          text
          severity="secondary"
          size="small"
          @click="clearTerminal"
        />

        <span class="ssh-actions-divider" />

        <Button
          v-tooltip.bottom="'Smaller text'"
          aria-label="Smaller text"
          icon="pi pi-minus"
          text
          severity="secondary"
          size="small"
          :disabled="fontSize <= MIN_FONT_SIZE"
          @click="changeFontSize(-1)"
        />
        <Button
          v-tooltip.bottom="'Larger text'"
          aria-label="Larger text"
          icon="pi pi-plus"
          text
          severity="secondary"
          size="small"
          :disabled="fontSize >= MAX_FONT_SIZE"
          @click="changeFontSize(1)"
        />
        <i
          v-tooltip.bottom="
            'Keys here go to the node. Ctrl+Shift+C copy, Ctrl+Shift+V paste, Ctrl+Shift+F find, Ctrl+Shift+F6 leave the terminal.'
          "
          class="pi pi-question-circle ssh-help"
          tabindex="0"
          role="img"
          aria-label="Keyboard help"
        />
      </div>
    </div>

    <div v-if="findOpen && !onForm" class="ssh-find">
      <InputText
        ref="findInputRef"
        v-model="findText"
        size="small"
        placeholder="Find in scrollback"
        aria-label="Find in scrollback"
        @input="findNext"
        @keydown.enter.exact.prevent="findNext"
        @keydown.enter.shift.prevent="findPrevious"
        @keydown.esc.prevent="closeFind"
      />
      <Button
        v-tooltip.bottom="'Previous (Shift+Enter)'"
        aria-label="Previous match"
        icon="pi pi-chevron-up"
        text
        severity="secondary"
        size="small"
        @click="findPrevious"
      />
      <Button
        v-tooltip.bottom="'Next (Enter)'"
        aria-label="Next match"
        icon="pi pi-chevron-down"
        text
        severity="secondary"
        size="small"
        @click="findNext"
      />
      <Button
        v-tooltip.bottom="'Close (Esc)'"
        aria-label="Close find"
        icon="pi pi-times"
        text
        severity="secondary"
        size="small"
        @click="closeFind"
      />
    </div>

    <div class="ssh-terminal-area">
      <div ref="hostRef" class="ssh-terminal-host" :class="{ 'ssh-behind': onForm }" />
    </div>

    <div v-if="nodeLoaded" v-show="onForm" class="ssh-form-layer">
      <SshConnectPanel
        ref="panelRef"
        :object="nodeDocument"
        :message="session.message"
        :remembered="remembered"
        :active="phase === 'idle'"
        :connecting="phase === 'connecting' || session.autoConnect"
        @connect="connectWith"
        @cancel="cancelConnect"
      />
    </div>
  </div>
</template>

<style scoped>
.ssh-terminal-view {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.ssh-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.ssh-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1 1 16rem;
  font-size: 0.8125rem;
}

.ssh-status-text {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.5rem;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ssh-status-error {
  color: var(--p-red-500);
  font-weight: 500;
}

.ssh-status-detail {
  color: var(--p-text-muted-color);
}

.ssh-status-dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--p-surface-400);
}

.ssh-status-dot--connected {
  background: var(--p-green-500);
}

.ssh-status-dot--connecting,
.ssh-status-dot--reconnecting {
  background: var(--p-amber-500);
}

.ssh-status-dot--error {
  background: var(--p-red-500);
}

.ssh-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.125rem;
}

.ssh-actions-divider {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.25rem;
  background: var(--p-surface-border);
}

.ssh-help {
  margin-left: 0.375rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.ssh-find {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.ssh-terminal-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.ssh-terminal-host {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.ssh-terminal-view:focus {
  outline: none;
}

/* Keeps its size, and out of the tab order. */
.ssh-behind {
  visibility: hidden;
}

/* On xterm's own element: the fit addon subtracts this padding, and not a parent's. */
.ssh-terminal-host :deep(.xterm) {
  height: 100%;
  padding: 0.25rem 0 0 0.375rem;
}

/* xterm.css paints this black, which shows around the text whatever the theme. */
.ssh-terminal-host :deep(.xterm .xterm-viewport) {
  background-color: transparent !important;
}

.ssh-form-layer {
  position: absolute;
  inset: 0;
  display: flex;
  padding: 1rem;
  overflow: auto;
  background: var(--p-surface-ground);
}
</style>
