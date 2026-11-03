import { get } from './client'

/**
 * Background tasks: a handler that cannot finish within a request answers 202 with a `taskId`.
 * Finished tasks are kept for a limited time, so a late poll can 404 for a completed task;
 * callers treat that as "outcome unknown", not failure.
 */

/**
 * @param {number} taskId
 * @returns {Promise<{ id: number, description: string, state: 'pending'|'running'|'completed'|'failed',
 *   progress: number, completionTime: string|null, failureReason: string|null }>}
 */
export function getBackgroundTask(taskId) {
  return get(`/v1/background-tasks/${taskId}`)
}

/** Task states that mean the task is no longer running. */
export const TERMINAL_TASK_STATES = ['completed', 'failed']

/**
 * @param {{ state?: string }|null} task
 * @returns {boolean}
 */
export function isTaskFinished(task) {
  return !!task && TERMINAL_TASK_STATES.includes(task.state)
}
