import { getCurrentInstance, isRef, onBeforeUnmount, toRaw, watch } from 'vue'

/**
 * Working state (filter, mode, sort, page, open rows, scroll, selection) kept in memory while a
 * view is unmounted. Not KeepAlive: a hidden view would keep polling. Memory only; cleared on
 * sign-out by `resetSessionState`.
 *
 * @typedef {import('vue').Ref | { get: () => *, set: (value: *) => void }} WorkingStateField
 */

/** @type {Map<string, { objectKey: string, view: object, object: object }>} */
const snapshots = new Map()

export function clearWorkingState() {
  snapshots.clear()
}

const OBJECT_PARAMS = ['objectId', 'dashboardId', 'mapId']

function objectKeyOf(route) {
  for (const name of OBJECT_PARAMS) {
    if (route?.params?.[name]) return String(route.params[name])
  }
  return ''
}

function read(field) {
  return isRef(field) ? field.value : field.get()
}

function write(field, value) {
  if (isRef(field)) field.value = value
  else field.set(value)
}

/** Deep, because `toRaw` is shallow: an array spread from a reactive one still holds proxies. */
function copy(value) {
  const raw = toRaw(value)
  if (raw instanceof Set) return new Set([...raw].map(copy))
  if (Array.isArray(raw)) return raw.map(copy)
  if (raw && Object.getPrototypeOf(raw) === Object.prototype) {
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, copy(item)]))
  }
  return raw
}

function readAll(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, copy(read(field))]),
  )
}

function writeAll(fields, values) {
  for (const [name, field] of Object.entries(fields)) {
    if (name in values) write(field, copy(values[name]))
  }
}

/**
 * Call in setup once the fields exist and before watchers that would react to their restored
 * values: restoring is synchronous. Scoped per perspective (first path segment) plus `key`.
 *
 * @example
 * useWorkingState('dcis', {
 *   view: { mode, filterText },
 *   object: { selectedDciIds },
 * })
 *
 * @param {string} key
 * @param {object} fields
 * @param {Record<string, WorkingStateField>} [fields.view] - kept across objects
 * @param {Record<string, WorkingStateField>} [fields.object] - restored only for the same
 *   object, reset when the view moves to another one without unmounting
 * @param {object} [options]
 * @param {() => *} [options.objectKey] - defaults to the route's object
 */
export function useWorkingState(key, { view = {}, object = {} } = {}, options = {}) {
  // `$route` rather than `useRoute()`: AppTable calls this, and specs mount it without a router.
  const globals = getCurrentInstance()?.appContext.config.globalProperties
  const currentRoute = () => globals?.$route
  const route = currentRoute()
  if (!route?.path) return

  const currentObjectKey = options.objectKey
    ? () => String(options.objectKey() ?? '')
    : () => objectKeyOf(currentRoute())
  const scope = `${route.path.split('/')[1]}/${key}`
  const defaults = readAll(object)
  let objectKey = currentObjectKey()

  const saved = snapshots.get(scope)
  if (saved) {
    writeAll(view, saved.view)
    if (saved.objectKey === objectKey) writeAll(object, saved.object)
  }

  // Post flush runs after any unmount in the same flush, so the save is filed under the object
  // the view showed before this reset.
  watch(
    currentObjectKey,
    (next) => {
      if (next === objectKey) return
      objectKey = next
      writeAll(object, defaults)
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    snapshots.set(scope, { objectKey, view: readAll(view), object: readAll(object) })
  })
}
