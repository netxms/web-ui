import { computed, toValue } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as objectToolsApi from '@/api/objectToolsApi'
import { STATIC_TIER } from './config'

export const objectToolKeys = {
  all: () => ['objectTools'],
  list: (params) => ['objectTools', 'list', params],
  detail: (id) => ['objectTools', 'detail', id],
  forObject: (objectId, params) => ['objectTools', 'forObject', objectId, params],
}

/**
 * @param {import('vue').MaybeRefOrGetter} [params]
 */
export function useObjectTools(params) {
  return useQuery({
    queryKey: computed(() => objectToolKeys.list(toValue(params))),
    queryFn: () => objectToolsApi.getObjectTools(toValue(params) || {}),
    ...STATIC_TIER,
  })
}

/**
 * Server-side filtered.
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @param {import('vue').MaybeRefOrGetter} [params]
 */
export function useObjectToolsForObject(objectId, params) {
  return useQuery({
    queryKey: computed(() => objectToolKeys.forObject(toValue(objectId), toValue(params))),
    queryFn: () => objectToolsApi.getObjectToolsForObject(toValue(objectId), toValue(params) || {}),
    enabled: computed(() => !!toValue(objectId)),
    ...STATIC_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} toolId
 */
export function useObjectTool(toolId) {
  return useQuery({
    queryKey: computed(() => objectToolKeys.detail(toValue(toolId))),
    queryFn: () => objectToolsApi.getObjectTool(toValue(toolId)),
    enabled: computed(() => !!toValue(toolId)),
    ...STATIC_TIER,
  })
}

/** The all-zero guid the server sends for "no image". */
const NULL_GUID = '00000000-0000-0000-0000-000000000000'

/**
 * Library image of each tool, by tool id (null for none). The list endpoints do not emit `icon`
 * yet, so icons come from each tool's detail document until any list document has an `icon` key.
 *
 * @param {import('vue').MaybeRefOrGetter<object[]|undefined>} tools
 * @returns {{ iconByToolId: import('vue').ComputedRef<Map<number, string|null>> }}
 */
export function useObjectToolIcons(tools) {
  const list = computed(() => toValue(tools) ?? [])
  const listCarriesIcons = computed(() => list.value.some((tool) => 'icon' in tool))

  const details = useQueries({
    queries: computed(() =>
      listCarriesIcons.value
        ? []
        : list.value
            // Menus never show these, so their icons are not needed.
            .filter((tool) => tool.name && !tool.disabled && tool.type !== 'command')
            .map((tool) => ({
              queryKey: objectToolKeys.detail(tool.id),
              queryFn: () => objectToolsApi.getObjectTool(tool.id),
              select: (detail) => ({ id: tool.id, icon: detail?.icon ?? null }),
              ...STATIC_TIER,
            })),
    ),
  })

  const iconByToolId = computed(() => {
    const icons = new Map()
    const valid = (guid) => (guid && guid !== NULL_GUID ? guid : null)
    if (listCarriesIcons.value) {
      for (const tool of list.value) icons.set(tool.id, valid(tool.icon))
    } else {
      for (const result of details.value) {
        if (result.data) icons.set(result.data.id, valid(result.data.icon))
      }
    }
    return icons
  })

  return { iconByToolId }
}

export function useCreateObjectTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => objectToolsApi.createObjectTool(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectToolKeys.all() }),
  })
}

export function useUpdateObjectTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ toolId, data }) => objectToolsApi.updateObjectTool(toolId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectToolKeys.all() }),
  })
}

export function useDeleteObjectTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (toolId) => objectToolsApi.deleteObjectTool(toolId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectToolKeys.all() }),
  })
}

export function useEnableObjectTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (toolId) => objectToolsApi.enableObjectTool(toolId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectToolKeys.all() }),
  })
}

export function useDisableObjectTool() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (toolId) => objectToolsApi.disableObjectTool(toolId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: objectToolKeys.all() }),
  })
}
