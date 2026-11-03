import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { MODERATE_TIER } from './config'
import * as geographicalAreasApi from '@/api/geographicalAreasApi'

export const geoAreaKeys = {
  all: () => ['geographicalAreas'],
  list: () => ['geographicalAreas', 'list'],
  detail: (id) => ['geographicalAreas', 'detail', id],
}

export function useGeographicalAreas() {
  return useQuery({
    queryKey: geoAreaKeys.list(),
    queryFn: () => geographicalAreasApi.getAreas(),
    ...MODERATE_TIER,
  })
}

export function useCreateGeographicalArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => geographicalAreasApi.createArea(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: geoAreaKeys.list() }),
  })
}

export function useUpdateGeographicalArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => geographicalAreasApi.updateArea(id, data),
    onSuccess: (updatedArea, { id }) => {
      queryClient.setQueryData(
        geoAreaKeys.list(),
        (old) => old?.map((a) => (a.id === id ? updatedArea : a)) ?? old,
      )
      queryClient.invalidateQueries({ queryKey: geoAreaKeys.list() })
      queryClient.invalidateQueries({ queryKey: geoAreaKeys.detail(id) })
    },
  })
}

export function useDeleteGeographicalArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force = false }) => geographicalAreasApi.deleteArea(id, force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: geoAreaKeys.list() }),
  })
}
