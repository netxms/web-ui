import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useToolExecutionStore = defineStore('toolExecution', () => {
  const executions = ref(new Map())

  function createExecution({
    toolId,
    toolName,
    toolType,
    objectId,
    objectName,
    inputValues,
    alarmId,
  }) {
    // One slot per tool per object.
    const id = `${objectId}-${toolId}`
    const execution = {
      id,
      toolId,
      toolName,
      toolType,
      objectId,
      objectName,
      status: 'pending',
      result: null,
      error: null,
      isStreaming: false,
      terminatedByUser: false,
      streamOutput: '',
      startedAt: new Date(),
      completedAt: null,
      inputValues: inputValues || {},
      alarmId,
    }
    executions.value.set(id, execution)
    return id
  }

  function updateExecution(executionId, updates) {
    const execution = executions.value.get(executionId)
    if (!execution) return
    Object.assign(execution, updates)
    executions.value.set(executionId, { ...execution })
  }

  function markRunning(executionId) {
    updateExecution(executionId, { status: 'running' })
  }

  function markCompleted(executionId, result) {
    updateExecution(executionId, {
      status: 'completed',
      result,
      completedAt: new Date(),
    })
  }

  function markError(executionId, error) {
    updateExecution(executionId, {
      status: 'error',
      error: error?.message || String(error),
      completedAt: new Date(),
    })
  }

  function appendStreamOutput(executionId, chunk) {
    const execution = executions.value.get(executionId)
    if (!execution) return
    executions.value.set(executionId, {
      ...execution,
      streamOutput: (execution.streamOutput || '') + chunk,
    })
  }

  function removeExecution(executionId) {
    executions.value.delete(executionId)
  }

  function getExecution(executionId) {
    return executions.value.get(executionId) || null
  }

  const executionList = computed(() => [...executions.value.values()])

  function getExecutionsForObject(objectId) {
    return executionList.value.filter((e) => e.objectId === objectId)
  }

  /**
   * `ObjectsView` rebuilds a tab per execution, so leftovers would reappear for the next user.
   * Sockets are closed separately (`closeAllToolStreams`).
   */
  function reset() {
    executions.value = new Map()
  }

  function hasExecution(executionId) {
    return executions.value.has(executionId)
  }

  return {
    executions,
    executionList,
    createExecution,
    updateExecution,
    markRunning,
    markCompleted,
    markError,
    appendStreamOutput,
    removeExecution,
    getExecution,
    getExecutionsForObject,
    hasExecution,
    reset,
  }
})
