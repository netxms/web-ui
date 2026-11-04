import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as aiApi from '@/api/aiApi'
import { MODERATE_TIER, VOLATILE_TIER } from './config'

export const aiKeys = {
  all: () => ['ai'],
  skillsAndFunctions: () => ['ai', 'skills-and-functions'],
  savedPrompts: () => ['ai', 'saved-prompts'],
  memory: () => ['ai', 'memory'],
  messages: () => ['ai', 'messages'],
}

/**
 * The whole list: the WebAPI has no push for these, and the rail, the tab bar and the table all
 * read this one query, so polling costs a single request.
 *
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useAiMessages({ enabled = true } = {}) {
  return useQuery({
    queryKey: aiKeys.messages(),
    queryFn: () => aiApi.getAiMessages(),
    enabled,
    ...VOLATILE_TIER,
  })
}

/**
 * Writes the answer into the cache instead of refetching, so a bulk action does not refetch once
 * per message. A poll already in flight would put the old status back, hence the cancel. A failure
 * (404, 409) means the list is out of date.
 */
export function useSetAiMessageStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, status }) => aiApi.setAiMessageStatus(messageId, status),
    onSuccess: async (updated) => {
      await queryClient.cancelQueries({ queryKey: aiKeys.messages() })
      queryClient.setQueryData(aiKeys.messages(), (list) =>
        list?.map((message) => (message.id === updated.id ? updated : message)),
      )
    },
    onError: () => queryClient.invalidateQueries({ queryKey: aiKeys.messages() }),
  })
}

export function useDeleteAiMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId }) => aiApi.deleteAiMessage(messageId),
    onSuccess: async (_data, { messageId }) => {
      await queryClient.cancelQueries({ queryKey: aiKeys.messages() })
      queryClient.setQueryData(aiKeys.messages(), (list) =>
        list?.filter((message) => message.id !== messageId),
      )
    },
    onError: () => queryClient.invalidateQueries({ queryKey: aiKeys.messages() }),
  })
}

/** Skills, functions and disabled extras. */
export function useAiSkillsAndFunctions() {
  return useQuery({
    queryKey: aiKeys.skillsAndFunctions(),
    queryFn: () => aiApi.getAiSkillsAndFunctions(),
    ...MODERATE_TIER,
  })
}

export function useDisableAiItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, name }) => aiApi.disableAiItem(type, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.all() }),
  })
}

export function useEnableAiItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, name }) => aiApi.enableAiItem(type, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.all() }),
  })
}

export function useSavedPrompts() {
  return useQuery({
    queryKey: aiKeys.savedPrompts(),
    queryFn: () => aiApi.getSavedPrompts(),
    ...MODERATE_TIER,
  })
}

export function useCreateSavedPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => aiApi.createSavedPrompt(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.savedPrompts() }),
  })
}

export function useUpdateSavedPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ promptId, data }) => aiApi.updateSavedPrompt(promptId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.savedPrompts() }),
  })
}

export function useDeleteSavedPrompt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ promptId }) => aiApi.deleteSavedPrompt(promptId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: aiKeys.savedPrompts() }),
  })
}

/** Every entry the caller can read. */
export function useAiMemoryEntries() {
  return useQuery({
    queryKey: aiKeys.memory(),
    queryFn: () => aiApi.getAiMemoryEntries(),
    ...MODERATE_TIER,
  })
}

/** No `memoryId` creates; otherwise only `title`, `content` and `locked` change. */
export function useSaveAiMemoryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ memoryId, data }) =>
      memoryId != null
        ? aiApi.updateAiMemoryEntry(memoryId, data)
        : aiApi.createAiMemoryEntry(data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aiKeys.memory() }),
  })
}

export function useDeleteAiMemoryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ memoryId }) => aiApi.deleteAiMemoryEntry(memoryId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: aiKeys.memory() }),
  })
}
