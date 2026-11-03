import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as scriptApi from '@/api/scriptApi'
import { openOutputStream } from '@/api/outputStream'
import { readNxslDiagnostic } from '@/utils/nxslDiagnostic'

export const useScriptStore = defineStore('script', () => {
  /**
   * `{ executionId, ws, outputEntry }` or null; not reactive. Every callback of a run checks it
   * still owns `current` before writing.
   */
  let current = null

  const source = ref('')
  const parameters = ref('')
  const selectedLibraryScript = ref(null)

  const library = ref([])
  const loadingLibrary = ref(false)
  const loadingScript = ref(false)

  const executing = ref(false)
  const stopping = ref(false)
  const output = ref([])
  const executionError = ref(null)

  const compiling = ref(false)
  const compileResult = ref(null)

  const saving = ref(false)

  const canExecute = computed(() => source.value.trim().length > 0 && !executing.value)
  const canStop = computed(() => executing.value)
  const hasOutput = computed(() => output.value.length > 0)
  const canSave = computed(
    () => selectedLibraryScript.value && source.value.trim().length > 0 && !saving.value,
  )
  const errorLine = computed(() => {
    if (compileResult.value?.success === false) return compileResult.value.errorLine
    if (executionError.value?.lineNumber) return executionError.value.lineNumber
    return null
  })

  function parsedParameters() {
    if (!parameters.value.trim()) return []
    return parameters.value
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  }

  async function fetchLibrary() {
    loadingLibrary.value = true
    try {
      library.value = await scriptApi.getScriptLibrary()
    } finally {
      loadingLibrary.value = false
    }
  }

  async function loadFromLibrary(scriptEntry) {
    if (!scriptEntry) return
    selectedLibraryScript.value = scriptEntry
    loadingScript.value = true
    try {
      const details = await scriptApi.getScript(scriptEntry.id)
      source.value = details.code
    } catch (err) {
      output.value.push({
        type: 'error',
        reason: 'Failed to load script',
        detail: err.message,
      })
      selectedLibraryScript.value = null
    } finally {
      loadingScript.value = false
    }
  }

  async function save() {
    if (!canSave.value) return
    saving.value = true
    try {
      await scriptApi.updateScript(
        selectedLibraryScript.value.id,
        selectedLibraryScript.value.name,
        source.value,
      )
      output.value.push({
        type: 'info',
        text: `Script "${selectedLibraryScript.value.name}" saved`,
      })
    } catch (err) {
      output.value.push({
        type: 'error',
        reason: 'Failed to save script',
        detail: err.message,
      })
    } finally {
      saving.value = false
    }
  }

  async function saveAs(name) {
    if (!name?.trim() || !source.value.trim()) return
    saving.value = true
    try {
      const result = await scriptApi.createScript(name.trim(), source.value)
      const newEntry = { id: result.id, name: name.trim() }
      library.value.push(newEntry)
      selectedLibraryScript.value = newEntry
      output.value.push({ type: 'info', text: `Script "${name.trim()}" created` })
    } catch (err) {
      output.value.push({
        type: 'error',
        reason: 'Failed to create script',
        detail: err.message,
      })
    } finally {
      saving.value = false
    }
  }

  async function compile() {
    compiling.value = true
    compileResult.value = null
    try {
      const result = await scriptApi.compileScript(source.value)
      compileResult.value = {
        success: result.success,
        errorLine: result.error?.lineNumber ?? null,
        errorMessage: result.error?.message ?? null,
      }
      if (result.success) {
        output.value.push({
          type: 'info',
          text: 'Compilation successful',
          warnings: result.warnings ?? [],
        })
      } else {
        output.value.push({
          type: 'error',
          reason: 'Compilation failed',
          detail: result.error?.message || '',
          warnings: result.warnings ?? [],
        })
      }
    } catch (err) {
      output.value.push({ type: 'error', reason: 'Compilation failed', detail: err.message })
    } finally {
      compiling.value = false
    }
  }

  /** Resolves once the run is under way; `executing` drops when it ends. */
  async function execute(objectId) {
    if (!canExecute.value) return

    const run = { executionId: null, ws: null, outputEntry: null }
    current = run
    executing.value = true
    stopping.value = false
    executionError.value = null

    let answer
    try {
      answer = await scriptApi.executeScript(objectId, {
        script: source.value,
        parameters: parsedParameters(),
        stream: true,
      })
    } catch (err) {
      if (current !== run) return
      reportFailure(err.data?.reason || err.message, err.data?.diagnostic)
      finish(run)
      return
    }
    if (current !== run) return

    if (!answer?.wsUrl) {
      // A server from before streaming ignores the flag and answers with the result.
      output.value.push({ type: 'result', text: formatResult(answer?.result) })
      finish(run)
      return
    }

    run.executionId = answer.executionId
    if (stopping.value) {
      // A stop that lands before the socket connects keeps the script from starting.
      await scriptApi.stopScriptExecution(run.executionId).catch(() => {})
      if (current !== run) return
    }
    run.ws = openOutputStream(answer.wsUrl, {
      onFrame: (frame) => current === run && handleFrame(run, frame),
      onClose: (event) => current === run && handleUnexpectedClose(run, event),
    })
  }

  function handleFrame(run, frame) {
    switch (frame.type) {
      case 'output':
        appendOutput(run, frame.data)
        break
      case 'result':
        output.value.push({ type: 'result', text: formatResult(frame.data) })
        break
      case 'completed':
        finish(run)
        break
      case 'stopped':
        output.value.push({ type: 'stopped', text: 'Script stopped' })
        finish(run)
        break
      case 'error':
        reportFailure(frame.message || 'Script execution failed', frame.diagnostic)
        finish(run)
        break
    }
  }

  /** Every final frame finishes the run first, so a close that gets here came without one. */
  function handleUnexpectedClose(run, event) {
    if (stopping.value) {
      output.value.push({ type: 'stopped', text: 'Script stopped' })
    } else {
      // The server stops a script whose output connection drops.
      output.value.push({
        type: 'error',
        reason: 'Lost the connection to the running script',
        detail: event.reason || `Connection closed (code ${event.code})`,
      })
    }
    finish(run)
  }

  /**
   * Chunks of one run join into one block, even when they split a line. A block that is no
   * longer last (Clear Output, a compile result in between) is left alone and a new one opens.
   */
  function appendOutput(run, text) {
    if (text == null || text === '') return
    if (!run.outputEntry || output.value.at(-1) !== run.outputEntry) {
      output.value.push({ type: 'output', text: '' })
      run.outputEntry = output.value.at(-1)
    }
    run.outputEntry.text += text
  }

  function reportFailure(reason, diagnostic) {
    const nxsl = readNxslDiagnostic(diagnostic)
    executionError.value = {
      message: nxsl?.message || reason,
      lineNumber: nxsl?.lineNumber ?? null,
    }
    output.value.push({
      type: 'error',
      reason,
      detail: nxsl?.message || '',
      warnings: nxsl?.warnings ?? [],
    })
  }

  function finish(run) {
    if (current !== run) return
    current = null
    executing.value = false
    stopping.value = false
    // The server closes after its final frame; this covers one that does not.
    run.ws?.close()
  }

  async function clearAndExecute(objectId) {
    output.value = []
    await execute(objectId)
  }

  /**
   * A second press before the server answers drops the connection, which also stops the
   * script server side.
   */
  function stop() {
    const run = current
    if (!run) return

    if (stopping.value) {
      output.value.push({ type: 'stopped', text: 'Script stopped' })
      finish(run)
      return
    }

    stopping.value = true
    if (run.ws?.readyState === WebSocket.OPEN) {
      run.ws.send(JSON.stringify({ type: 'stop' }))
    } else if (run.executionId !== null) {
      // The socket is still connecting; the REST stop reaches the execution either way.
      scriptApi.stopScriptExecution(run.executionId).catch(() => {})
    }
    // Otherwise the script is still compiling, and execute() stops it once it has an id.
  }

  function clearOutput() {
    output.value = []
    executionError.value = null
  }

  function clearSource() {
    source.value = ''
    selectedLibraryScript.value = null
  }

  /**
   * The store outlives a sign-out and `NxslScriptRunner` binds straight to `source`. Closing a
   * running script's socket stops it on the server.
   */
  function reset() {
    const run = current
    current = null
    run?.ws?.close(1000, 'session ended')
    source.value = ''
    parameters.value = ''
    selectedLibraryScript.value = null
    library.value = []
    loadingLibrary.value = false
    loadingScript.value = false
    executing.value = false
    stopping.value = false
    output.value = []
    executionError.value = null
    compiling.value = false
    compileResult.value = null
    saving.value = false
  }

  function formatResult(result) {
    if (result === null || result === undefined) return 'null'
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  }

  return {
    source,
    parameters,
    selectedLibraryScript,
    library,
    loadingLibrary,
    loadingScript,
    executing,
    stopping,
    output,
    executionError,
    compiling,
    compileResult,
    saving,
    canExecute,
    canStop,
    canSave,
    hasOutput,
    errorLine,
    fetchLibrary,
    loadFromLibrary,
    compile,
    save,
    saveAs,
    execute,
    clearAndExecute,
    stop,
    clearOutput,
    clearSource,
    reset,
  }
})
