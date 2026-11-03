import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as deviceConfigBackupApi from '@/api/deviceConfigBackupApi'
import { getBackgroundTask, isTaskFinished } from '@/api/backgroundTasksApi'
import { MODERATE_TIER, STATIC_TIER } from './config'

export const deviceConfigBackupKeys = {
  list: (objectId) => ['device-config-backups', 'list', toValue(objectId)],
  detail: (objectId, backupId) => [
    'device-config-backups',
    'detail',
    toValue(objectId),
    toValue(backupId),
  ],
  task: (taskId) => ['background-task', toValue(taskId)],
}

/**
 * MODERATE: new rows appear only when the backup job runs, and the call reaches an external
 * backup provider.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 */
export function useDeviceConfigBackups(objectId) {
  return useQuery({
    queryKey: computed(() => deviceConfigBackupKeys.list(objectId)),
    queryFn: () => deviceConfigBackupApi.getDeviceConfigBackups(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...MODERATE_TIER,
    refetchOnWindowFocus: false,
  })
}

/**
 * A stored backup is immutable, so this is cached hard. Content needs `readDeviceConfig` and a
 * refusal is audited, so the caller gates on the right before enabling this.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<number|null>} backupId
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useDeviceConfigBackup(objectId, backupId, options = {}) {
  const baseEnabled = computed(() => !!toValue(objectId) && !!toValue(backupId))
  return useQuery({
    queryKey: computed(() => deviceConfigBackupKeys.detail(objectId, backupId)),
    queryFn: () =>
      deviceConfigBackupApi.getDeviceConfigBackup(toValue(objectId), toValue(backupId)),
    enabled:
      options.enabled === undefined
        ? baseEnabled
        : computed(() => baseEnabled.value && !!toValue(options.enabled)),
    ...STATIC_TIER,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

/**
 * Resolves with the background task id, not the outcome (`useBackgroundTask`). Nothing is
 * invalidated: a restore writes to the device, not the backup store.
 */
export function useRestoreDeviceConfig() {
  return useMutation({
    mutationFn: ({ targetObjectId, ...options }) =>
      deviceConfigBackupApi.restoreDeviceConfig(targetObjectId, options),
  })
}

/**
 * Polls every 2s until a terminal state, like the legacy client. `retry: false` so a 404 (task
 * already evicted) settles as an error the caller reports as "outcome unknown".
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} taskId
 */
export function useBackgroundTask(taskId) {
  return useQuery({
    queryKey: computed(() => deviceConfigBackupKeys.task(taskId)),
    queryFn: () => getBackgroundTask(toValue(taskId)),
    enabled: computed(() => !!toValue(taskId)),
    refetchInterval: (query) => (isTaskFinished(query.state.data) ? false : 2000),
    staleTime: 0,
    gcTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useInvalidateDeviceConfigBackups() {
  const queryClient = useQueryClient()
  return (objectId) =>
    queryClient.invalidateQueries({ queryKey: deviceConfigBackupKeys.list(objectId) })
}
