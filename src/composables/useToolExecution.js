import { useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useToolExecutionStore } from '@/stores/toolExecutionStore'
import { executeObjectTool } from '@/api/objectToolsApi'
import { openOutputStream } from '@/api/outputStream'
import { expandText } from '@/api/objectsApi'
import { isSafeExternalUrl, REMOTE_ACCESS_SCHEMES } from '@/utils/sanitize'

// The server answers these with 202 + a WebSocket URL
const STREAMABLE_TYPES = new Set(['action', 'server-command', 'server-script', 'ssh-command'])

const activeStreams = new Map() // executionId -> WebSocket

/** For sign-out: the sockets outlive the session in the same tab and nothing else closes them. */
export function closeAllToolStreams() {
  for (const ws of activeStreams.values()) {
    ws.close(1000, 'session ended')
  }
  activeStreams.clear()
}

export function useToolExecution() {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const executionStore = useToolExecutionStore()

  /**
   * @param {object} object - { id, name }
   * @param {object} tool
   * @param {object} [inputValues]
   * @param {object} [context]
   * @param {number} [context.alarmId] - the alarm the tool runs for, for its macros
   * @returns {Promise<string|null>} execution ID, or null if cancelled or external
   */
  async function executeTool(object, tool, inputValues = {}, { alarmId } = {}) {
    if (tool.type === 'url') {
      await handleUrlTool(object, tool, alarmId)
      return null
    }

    if (tool.type === 'command') {
      await handleCommandTool(object, tool, inputValues, alarmId)
      return null
    }

    if (tool.askConfirmation) {
      const confirmed = await showConfirmation(object, tool, inputValues, alarmId)
      if (!confirmed) return null
    }

    // Other tools run first and open a tab only if the response has something to show.
    const navigateFirst = tool.generatesOutput

    const executionId = executionStore.createExecution({
      toolId: tool.id,
      toolName: tool.commandShortName || tool.name || `Tool ${tool.id}`,
      toolType: tool.type,
      objectId: object.id,
      objectName: object.name,
      inputValues,
      alarmId,
    })

    if (navigateFirst) {
      navigateToToolTab(object.id, tool.id)
    }

    try {
      executionStore.markRunning(executionId)
      const result = await executeToolApi(object.id, tool, inputValues, alarmId)

      if (result?.wsUrl) {
        connectStream(executionId, result.wsUrl)
        if (!navigateFirst) {
          navigateToToolTab(object.id, tool.id)
        }
      } else if (result?.type === 'none' || !result) {
        const toolName = tool.commandShortName || tool.name
        if (!tool.suppressSuccessMessage) {
          toast.add({
            severity: 'success',
            summary: 'Tool executed',
            detail: `${toolName} completed on ${object.name}`,
            life: 4000,
          })
        }
        executionStore.removeExecution(executionId)
      } else {
        executionStore.markCompleted(executionId, result)
        if (!navigateFirst) {
          navigateToToolTab(object.id, tool.id)
        }
      }
    } catch (error) {
      executionStore.markError(executionId, error)

      if (!navigateFirst) {
        toast.add({
          severity: 'error',
          summary: 'Tool failed',
          detail: error.message || 'Unknown error',
          life: 6000,
        })
        executionStore.removeExecution(executionId)
      }
    }

    return executionId
  }

  async function reExecute(executionId) {
    const execution = executionStore.getExecution(executionId)
    if (!execution) return

    executionStore.updateExecution(executionId, {
      status: 'pending',
      result: null,
      error: null,
      streamOutput: '',
      startedAt: new Date(),
      completedAt: null,
    })

    try {
      executionStore.markRunning(executionId)
      const inputFields =
        Object.keys(execution.inputValues).length > 0 ? execution.inputValues : undefined
      const useStream = STREAMABLE_TYPES.has(execution.toolType)
      const result = await executeObjectTool(execution.toolId, execution.objectId, {
        inputFields,
        stream: useStream,
        alarmId: execution.alarmId,
      })

      if (result?.wsUrl) {
        connectStream(executionId, result.wsUrl)
      } else {
        executionStore.markCompleted(executionId, result)
      }
    } catch (error) {
      executionStore.markError(executionId, error)
    }
  }

  function connectStream(executionId, wsPath) {
    const ws = openOutputStream(wsPath, {
      onFrame: (msg) => handleStreamFrame(executionId, msg),
      onClose: (event) => handleStreamClose(executionId, event),
      onError: () => {
        executionStore.markError(executionId, new Error('WebSocket connection error'))
      },
    })
    activeStreams.set(executionId, ws)
    executionStore.updateExecution(executionId, { isStreaming: true })
  }

  function handleStreamFrame(executionId, msg) {
    switch (msg.type) {
      case 'output':
        if (msg.data != null) executionStore.appendStreamOutput(executionId, msg.data)
        break

      case 'result':
        // Script return value (server-script tools)
        if (msg.data != null) executionStore.appendStreamOutput(executionId, msg.data)
        break

      case 'completed': {
        const execution = executionStore.getExecution(executionId)
        executionStore.markCompleted(executionId, {
          type: 'text',
          output: execution?.streamOutput || '',
        })
        break
      }

      case 'error':
        executionStore.markError(executionId, new Error(msg.message || 'Tool execution failed'))
        break
    }
  }

  function handleStreamClose(executionId, event) {
    activeStreams.delete(executionId)
    executionStore.updateExecution(executionId, { isStreaming: false })
    const execution = executionStore.getExecution(executionId)
    if (!execution || execution.status !== 'running') return
    // Server closed without sending 'completed' or 'error'
    if (event.wasClean && event.code === 1000) {
      const output = execution.terminatedByUser
        ? (execution.streamOutput || '') + '\n*** TERMINATED ***'
        : execution.streamOutput || ''
      executionStore.markCompleted(executionId, { type: 'text', output })
    } else {
      executionStore.markError(
        executionId,
        new Error(event.reason || `Connection closed (${event.code})`),
      )
    }
  }

  function terminateStream(executionId) {
    const ws = activeStreams.get(executionId)
    if (ws) {
      executionStore.updateExecution(executionId, { terminatedByUser: true })
      ws.close(1000, 'terminated')
    }
  }

  async function showConfirmation(object, tool, inputValues, alarmId) {
    // A failed expansion falls back to the raw text (the command path aborts instead).
    const message = await expandOrFallback(
      object.id,
      tool.confirmationMessage || `Execute ${tool.name}?`,
      inputValues,
      tool.confirmationMessage || `Execute ${tool.name}?`,
      alarmId,
    )

    return new Promise((resolve) => {
      confirm.require({
        message,
        header: 'Confirm',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Execute',
        rejectLabel: 'Cancel',
        accept: () => resolve(true),
        reject: () => resolve(false),
        // Escape / close icon fire neither accept nor reject.
        onHide: () => resolve(false),
      })
    })
  }

  function navigateToToolTab(objectId, toolId) {
    router.push({
      name: 'infrastructure',
      params: { objectId, viewId: `tool:${toolId}` },
    })
  }

  async function executeToolApi(objectId, tool, inputValues, alarmId) {
    const inputFields = Object.keys(inputValues).length > 0 ? inputValues : undefined
    const useStream = STREAMABLE_TYPES.has(tool.type)
    return executeObjectTool(tool.id, objectId, { inputFields, stream: useStream, alarmId })
  }

  async function handleUrlTool(object, tool, alarmId) {
    try {
      const result = await executeObjectTool(tool.id, object.id, { alarmId })
      const url = result?.url || result?.output || ''
      if (!url) return
      // Any MANAGE_TOOLS holder authors this; a javascript: URI would run in our origin.
      if (!isSafeExternalUrl(url)) {
        toast.add({
          severity: 'error',
          summary: 'Blocked unsafe URL',
          detail: `"${tool.name}" returned a URL with an unsupported scheme and was not opened.`,
          life: 6000,
        })
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: 'Failed to open URL',
        detail: error.message || 'Unknown error',
        life: 6000,
      })
    }
  }

  async function handleCommandTool(object, tool, inputValues, alarmId) {
    if (!tool.data) return

    // No raw-text fallback: an un-expanded `ssh://%U@%a` points at a host that does not exist.
    const command = await expandOrFallback(object.id, tool.data, inputValues, null, alarmId)
    if (command === null) {
      toast.add({
        severity: 'error',
        summary: 'Cannot expand command',
        detail: `The macros in "${tool.name}" could not be expanded, so it was not opened.`,
        life: 6000,
      })
      return
    }
    if (!command) return

    // Untrusted: authored by any MANAGE_TOOLS holder, with object properties spliced in.
    if (!isSafeExternalUrl(command, { extraSchemes: REMOTE_ACCESS_SCHEMES })) {
      toast.add({
        severity: 'error',
        summary: 'Blocked unsafe command',
        detail: `"${tool.name}" did not produce a supported URL scheme and was not opened.`,
        life: 6000,
      })
      return
    }
    window.open(command, '_blank', 'noopener,noreferrer')
  }

  /**
   * Macros are expanded server-side: several (`%[script]`, `%(input)`, ...) depend on state the
   * client cannot see.
   *
   * @param {number} objectId
   * @param {string} text
   * @param {Record<string,string>} inputValues - for `%(name)`
   * @param {string|null} fallback - returned on failure
   * @param {number} [alarmId] - for the alarm macros
   */
  async function expandOrFallback(objectId, text, inputValues, fallback, alarmId) {
    if (!text) return text
    try {
      return await expandText(objectId, text, {
        ...(alarmId ? { alarmId } : {}),
        inputFields: inputValues,
      })
    } catch {
      return fallback
    }
  }

  return {
    executeTool,
    reExecute,
    terminateStream,
  }
}
