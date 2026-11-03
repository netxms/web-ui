import { computed, toValue } from 'vue'
import { adaptBaseObject } from '@/api/objectAdapters'
import { useObjectsByIds, useZoneNames } from '@/queries/useObjectQueries'
import { useUsers } from '@/queries/useUserQueries'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { COLUMN_KIND, getColumnKind } from '@/utils/logColumnTypes'

// Caps the per-object fetch fallback, used only against servers that do not resolve names.
const MAX_RESOLVED_OBJECTS = 200

/**
 * Resolve the coded ids in log records to names.
 *
 * The server names objects and users in each page's `resolvedValues` (including users the
 * caller cannot read through `/v1/users`). Older servers lack it, so this falls back to
 * per-object fetches and the privileged user list.
 *
 * @param {import('vue').MaybeRefOrGetter<object[]>} records
 * @param {import('vue').MaybeRefOrGetter<import('@/api/logsApi').LogColumn[]>} columns
 * @param {import('vue').MaybeRefOrGetter<object[]>} [resolvedPages] - per-page `resolvedValues`
 */
export function useLogValueResolver(records, columns, resolvedPages) {
  const objectColumns = computed(() =>
    (toValue(columns) ?? [])
      .filter((column) => getColumnKind(column.type) === COLUMN_KIND.OBJECT)
      .map((column) => column.name),
  )

  const serverResolved = computed(() => {
    const objects = new Map()
    const users = new Map()
    for (const page of toValue(resolvedPages) ?? []) {
      for (const [id, object] of Object.entries(page?.objects ?? {})) {
        objects.set(Number(id), adaptBaseObject(object))
      }
      for (const [id, name] of Object.entries(page?.users ?? {})) {
        users.set(Number(id), name)
      }
    }
    return { objects, users }
  })

  /** Only the ids the server did not resolve. */
  const objectIds = computed(() => {
    const names = objectColumns.value
    if (names.length === 0) return []
    const resolved = serverResolved.value.objects
    const ids = new Set()
    for (const record of toValue(records) ?? []) {
      for (const name of names) {
        const id = record[name]
        if (id && !resolved.has(id)) ids.add(id)
        if (ids.size >= MAX_RESOLVED_OBJECTS) return [...ids]
      }
    }
    return [...ids]
  })

  const { objectsById: fetchedObjectsById } = useObjectsByIds(objectIds)
  const zonesByUin = useZoneNames()
  const { data: users } = useUsers()
  const { data: eventTemplates } = useEventTemplates()

  const objectsById = computed(() => {
    const fetched = fetchedObjectsById.value
    if (fetched.size === 0) return serverResolved.value.objects
    return new Map([...fetched, ...serverResolved.value.objects])
  })

  const usersById = computed(() => {
    const map = new Map()
    for (const user of users.value ?? []) map.set(user.id, user.name)
    for (const [id, name] of serverResolved.value.users) map.set(id, name)
    return map
  })

  const eventsByCode = computed(() => {
    const map = new Map()
    for (const template of eventTemplates.value ?? []) map.set(template.code, template.name)
    return map
  })

  return computed(() => ({
    objectsById: objectsById.value,
    usersById: usersById.value,
    zonesByUin: zonesByUin.value,
    eventsByCode: eventsByCode.value,
  }))
}
