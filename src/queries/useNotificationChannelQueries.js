import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as notificationChannelsApi from '@/api/notificationChannelsApi'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const notificationChannelKeys = {
  all: () => ['notificationChannels'],
  list: () => ['notificationChannels', 'list'],
  drivers: () => ['notificationChannels', 'drivers'],
}

export function useNotificationChannels() {
  return useQuery({
    queryKey: notificationChannelKeys.list(),
    queryFn: () => notificationChannelsApi.getNotificationChannels(),
    ...MODERATE_TIER,
  })
}

export function useNotificationDrivers() {
  return useQuery({
    queryKey: notificationChannelKeys.drivers(),
    queryFn: () => notificationChannelsApi.getNotificationDrivers(),
    ...STATIC_TIER,
  })
}

export function useCreateNotificationChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => notificationChannelsApi.createNotificationChannel(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationChannelKeys.all() }),
  })
}

export function useUpdateNotificationChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }) => notificationChannelsApi.updateNotificationChannel(name, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationChannelKeys.all() }),
  })
}

export function useRenameNotificationChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, newName }) =>
      notificationChannelsApi.renameNotificationChannel(name, newName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationChannelKeys.all() }),
  })
}

export function useDeleteNotificationChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => notificationChannelsApi.deleteNotificationChannel(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationChannelKeys.all() }),
  })
}

export function useClearNotificationChannelQueue() {
  return useMutation({
    mutationFn: (name) => notificationChannelsApi.clearNotificationChannelQueue(name),
  })
}

export function useSendNotification() {
  return useMutation({
    mutationFn: ({ name, data }) => notificationChannelsApi.sendNotification(name, data),
  })
}
