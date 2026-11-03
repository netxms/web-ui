import { computed, toValue } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import * as dataExportApi from '@/api/dataExportApi'
import { buildSelectionRequest, exportPollInterval, isExportFinished } from '@/utils/dataExport'

export const dataExportKeys = {
  all: ['dataExport'],
  preview: (selection) => ['dataExport', 'preview', selection],
  state: (taskId) => ['dataExport', 'state', taskId],
}

/**
 * Keyed on the selection, not the request: a rolling window resolves against "now" on each run.
 * Never stale and not refetched on focus: the preview changes only when the user asks.
 *
 * @param {import('vue').MaybeRefOrGetter<object|null>} selection - null for no preview
 */
export function useDataExportPreview(selection) {
  return useQuery({
    queryKey: computed(() => dataExportKeys.preview(toValue(selection))),
    queryFn: ({ signal }) =>
      dataExportApi.previewDataExport(buildSelectionRequest(toValue(selection)), { signal }),
    enabled: computed(() => !!toValue(selection)),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useStartDataExport() {
  return useMutation({
    mutationFn: (request) => dataExportApi.startDataExport(request),
  })
}

/**
 * Polls every second until a terminal state, like the legacy view. Polling stops on 404 (task
 * gone) and 403 (another account's task); other failures retry on the next tick.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} taskId
 */
export function useDataExportState(taskId) {
  return useQuery({
    queryKey: computed(() => dataExportKeys.state(toValue(taskId))),
    queryFn: ({ signal }) => dataExportApi.getDataExportState(toValue(taskId), { signal }),
    enabled: computed(() => !!toValue(taskId)),
    refetchInterval: (query) => exportPollInterval(query.state.data, query.state.error),
    // Once its files are downloaded the server forgets a finished task: asking again gives 404.
    refetchOnMount: (query) => !isExportFinished(query.state.data),
    staleTime: 0,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
