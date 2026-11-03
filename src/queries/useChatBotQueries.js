import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as chatBotsApi from '@/api/chatBotsApi'
import { notificationChannelKeys } from './useNotificationChannelQueries'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const chatBotKeys = {
  all: () => ['chatBots'],
  list: () => ['chatBots', 'list'],
  detail: (name) => ['chatBots', 'detail', name],
  drivers: () => ['chatBots', 'drivers'],
}

export function useChatBots() {
  return useQuery({
    queryKey: chatBotKeys.list(),
    queryFn: () => chatBotsApi.getChatBots(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} botName
 */
export function useChatBot(botName) {
  return useQuery({
    queryKey: computed(() => chatBotKeys.detail(toValue(botName))),
    queryFn: () => chatBotsApi.getChatBot(toValue(botName)),
    enabled: computed(() => {
      const name = toValue(botName)
      return !!name && name !== 'new'
    }),
    ...MODERATE_TIER,
  })
}

export function useChatBotDrivers() {
  return useQuery({
    queryKey: chatBotKeys.drivers(),
    queryFn: () => chatBotsApi.getChatBotDrivers(),
    ...STATIC_TIER,
  })
}

/** Creating, renaming and deleting a bot also changes its companion notification channel. */
function invalidateBotsAndChannels(queryClient) {
  queryClient.invalidateQueries({ queryKey: chatBotKeys.all() })
  queryClient.invalidateQueries({ queryKey: notificationChannelKeys.all() })
}

export function useCreateChatBot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => chatBotsApi.createChatBot(data),
    onSuccess: () => invalidateBotsAndChannels(queryClient),
  })
}

export function useUpdateChatBot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }) => chatBotsApi.updateChatBot(name, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatBotKeys.all() }),
  })
}

export function useRenameChatBot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, newName }) => chatBotsApi.renameChatBot(name, newName),
    onSuccess: () => invalidateBotsAndChannels(queryClient),
  })
}

export function useDeleteChatBot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => chatBotsApi.deleteChatBot(name),
    onSuccess: () => invalidateBotsAndChannels(queryClient),
  })
}
