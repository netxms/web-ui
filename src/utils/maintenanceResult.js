/**
 * Requests settle independently, so part of a selection can fail; App.vue toasts the succeeded
 * and failed groups separately.
 *
 * @param {object} options
 * @param {Array<{id: number, name: string}>} options.objects - targets, in request order
 * @param {PromiseSettledResult[]} options.results - `Promise.allSettled` over those requests
 * @param {boolean} options.maintenance - true for start, false for end (toast wording)
 * @returns {{succeeded: Array, failed: Array}}
 */
export function dispatchMaintenanceResult({ objects, results, maintenance }) {
  const succeeded = []
  const failed = []

  results.forEach((result, index) => {
    const object = objects[index]
    if (result.status === 'fulfilled') {
      succeeded.push({ id: object.id, name: object.name })
    } else {
      failed.push({
        id: object.id,
        name: object.name,
        status: result.reason?.status,
        message: result.reason?.message,
      })
    }
  })

  window.dispatchEvent(
    new CustomEvent('app:objectMaintenanceChanged', {
      detail: { maintenance, succeeded, failed },
    }),
  )

  return { succeeded, failed }
}
