import { ref } from 'vue'
import { defineStore } from 'pinia'

export const usePollExecutionStore = defineStore('pollExecution', () => {
  // key: `{objectId}-{pollType}`
  const executions = ref(new Map())

  function createExecution({ pollType, pollLabel, objectId, objectName }) {
    const id = `${objectId}-${pollType}`
    executions.value.set(id, {
      id,
      pollType,
      pollLabel,
      objectId,
      objectName,
      status: 'pending',
      streamOutput: '',
      error: null,
      startedAt: new Date(),
      completedAt: null,
    })
    return id
  }

  function updateExecution(executionId, updates) {
    const execution = executions.value.get(executionId)
    if (!execution) return
    executions.value.set(executionId, { ...execution, ...updates })
  }

  function markRunning(executionId) {
    updateExecution(executionId, { status: 'running' })
  }

  function markCompleted(executionId) {
    updateExecution(executionId, { status: 'completed', completedAt: new Date() })
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

  function resetExecution(executionId) {
    updateExecution(executionId, {
      status: 'pending',
      streamOutput: '',
      error: null,
      startedAt: new Date(),
      completedAt: null,
    })
  }

  function reset() {
    executions.value = new Map()
  }

  function getExecution(executionId) {
    return executions.value.get(executionId) || null
  }

  return {
    executions,
    createExecution,
    updateExecution,
    markRunning,
    markCompleted,
    markError,
    appendStreamOutput,
    resetExecution,
    getExecution,
    reset,
  }
})
