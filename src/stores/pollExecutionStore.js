import { ref } from 'vue'
import { defineStore } from 'pinia'
import { startObjectPoll } from '@/api/objectsApi'
import { openOutputStream } from '@/api/outputStream'
import { formatTimeShort } from '@/utils/timeFormat'

/**
 * Forced polls started in this browser tab, one per object and poll type, so every view of a
 * poll shows the same output (the legacy PollManager). A run appends to the output; only Clear
 * empties it. The server finishes a poll whose socket closes, so nothing here can stop one.
 */
export const usePollExecutionStore = defineStore('pollExecution', () => {
  /** `${objectId}:${pollType}` -> `{ status, lines, error, startedAt, completedAt }` */
  const executions = ref(new Map())
  // Key -> the current run `{ ws }`; not reactive. Callbacks of a run that is no longer current do nothing.
  const runs = new Map()
  let nextLineId = 1

  function keyOf(objectId, pollType) {
    return `${objectId}:${pollType}`
  }

  function getExecution(objectId, pollType) {
    return executions.value.get(keyOf(objectId, pollType)) ?? null
  }

  /** @param {Array<{ text: string, level?: string|null }>} entries */
  function appendLines(key, entries) {
    const execution = executions.value.get(key)
    if (!execution) return
    const time = formatTimeShort(new Date())
    execution.lines.push(
      ...entries.map(({ text, level }) => ({ id: nextLineId++, time, text, level: level ?? null })),
    )
  }

  /** Resolves once the output stream is opened or the start has failed. */
  async function start(objectId, pollType) {
    const key = keyOf(objectId, pollType)
    if (executions.value.get(key)?.status === 'running') return
    if (!executions.value.has(key)) {
      executions.value.set(key, {
        status: 'idle',
        lines: [],
        error: null,
        startedAt: null,
        completedAt: null,
      })
    }
    const run = { ws: null }
    runs.set(key, run)
    Object.assign(executions.value.get(key), {
      status: 'running',
      error: null,
      startedAt: new Date(),
      completedAt: null,
    })
    appendLines(key, [{ text: '**** Poll request sent to server ****', level: 'local' }])

    let answer
    try {
      answer = await startObjectPoll(objectId, pollType)
    } catch (err) {
      if (runs.get(key) === run) fail(key, run, err.message)
      return
    }
    if (runs.get(key) !== run) return
    if (!answer?.wsUrl) {
      fail(key, run, 'The server did not open an output stream for the poll')
      return
    }

    run.ws = openOutputStream(answer.wsUrl, {
      lines: true,
      onFrame: (frame) => runs.get(key) === run && handleFrame(key, run, frame),
      // Every final frame ends the run first, so a close that gets here came without one.
      onClose: (event) =>
        runs.get(key) === run &&
        fail(
          key,
          run,
          `Lost the connection to the server (${event.reason || `code ${event.code}`}); ` +
            'the poll runs on there without output',
        ),
    })
  }

  function handleFrame(key, run, frame) {
    switch (frame.type) {
      case 'output':
        if (frame.lines) appendLines(key, frame.lines)
        break
      case 'completed':
        appendLines(key, [{ text: '**** Poll completed successfully ****', level: 'local' }])
        finish(key, run, 'completed')
        break
      case 'error':
        fail(key, run, frame.message || 'Poll failed')
        break
    }
  }

  function fail(key, run, reason) {
    appendLines(key, [
      { text: `POLL ERROR: ${reason}`, level: 'error' },
      { text: '**** Poll failed ****', level: 'local' },
    ])
    finish(key, run, 'error', reason)
  }

  function finish(key, run, status, error = null) {
    runs.delete(key)
    const execution = executions.value.get(key)
    if (execution) Object.assign(execution, { status, error, completedAt: new Date() })
    // The server closes after its final frame; this covers one that does not.
    run.ws?.close()
  }

  function clearOutput(objectId, pollType) {
    const execution = getExecution(objectId, pollType)
    if (execution) execution.lines = []
  }

  /** Sign-out: the next account in this tab must not see these polls. */
  function reset() {
    // Forgotten before closing, so their close handlers do nothing.
    const open = [...runs.values()]
    runs.clear()
    for (const run of open) run.ws?.close(1000, 'session ended')
    executions.value = new Map()
  }

  return { executions, getExecution, start, clearOutput, reset }
})
