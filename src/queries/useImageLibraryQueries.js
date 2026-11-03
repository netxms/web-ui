import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { MODERATE_TIER, STATIC_TIER } from './config'
import * as imageLibraryApi from '@/api/imageLibraryApi'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import { ICON_LIBRARY_CATEGORY, lucideIconSvg } from '@/utils/iconSvg'

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

export const imageLibraryKeys = {
  all: () => ['imageLibrary'],
  list: () => ['imageLibrary', 'list'],
  detail: (id) => ['imageLibrary', 'detail', id],
  data: (guid) => ['imageLibrary', 'data', guid],
  byGuidAll: () => ['imageLibrary', 'byGuid'],
  byGuid: (guids) => ['imageLibrary', 'byGuid', guids],
}

export function useImageLibrary() {
  return useQuery({
    queryKey: imageLibraryKeys.list(),
    queryFn: () => imageLibraryApi.getImages(),
    ...MODERATE_TIER,
  })
}

/**
 * Blob URL for one guid. Pass `enabled: false` until the image is on screen.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} guid
 * @param {{ enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 */
export function useImageData(guid, options = {}) {
  return useQuery({
    queryKey: computed(() => imageLibraryKeys.data(toValue(guid))),
    queryFn: () => imageLibraryApi.getImageDataUrl(toValue(guid)),
    enabled: computed(() => {
      const g = toValue(guid)
      if (!g || g === NULL_GUID) return false
      return options.enabled === undefined ? true : !!toValue(options.enabled)
    }),
    ...STATIC_TIER,
  })
}

/**
 * guid -> blob URL map for a known set. Requests are capped rather than fired all at once.
 *
 * @param {import('vue').MaybeRefOrGetter<string[]>} guids
 */
export function useImagesByGuid(guids) {
  return useQuery({
    queryKey: computed(() => imageLibraryKeys.byGuid([...(toValue(guids) ?? [])].sort())),
    queryFn: () => imageLibraryApi.getImageDataUrls(toValue(guids) ?? []),
    enabled: computed(() => (toValue(guids) ?? []).length > 0),
    ...STATIC_TIER,
  })
}

export function useImageLibraryItem(id) {
  return useQuery({
    queryKey: computed(() => imageLibraryKeys.detail(toValue(id))),
    queryFn: () => imageLibraryApi.getImage(toValue(id)),
    enabled: computed(() => {
      const v = toValue(id)
      return !!v && v !== NULL_GUID
    }),
    ...MODERATE_TIER,
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => imageLibraryApi.uploadImage(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imageLibraryKeys.list() }),
  })
}

/**
 * Never rejects: each image is reported as added or failed.
 *
 * Variables: `{ images: { name, category, file }[], onProgress?: (done, total) => void }`.
 * Resolves with `{ added: object[], failed: { name, error }[] }`.
 */
export function useImportImages() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ images, onProgress }) => {
      let done = 0
      const added = []
      const failed = []
      await mapConcurrent(images, async (image) => {
        try {
          added.push(await imageLibraryApi.uploadImage(image, { withData: false }))
        } catch (error) {
          failed.push({ name: image.name, error })
        }
        onProgress?.(++done, images.length)
      })
      return { added, failed }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: imageLibraryKeys.list() }),
  })
}

/**
 * Library image for a built-in (Lucide) icon, for fields the server stores as an image-library
 * guid. An existing image of the same name in the icon pack's category is reused.
 *
 * Variables: `{ name, component }` (the image name and the Lucide component).
 * Resolves with the image guid.
 */
export function useLibraryImageForIcon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, component }) => {
      const images = await queryClient.fetchQuery({
        queryKey: imageLibraryKeys.list(),
        queryFn: () => imageLibraryApi.getImages(),
        staleTime: 0,
      })
      const existing = images.find(
        (image) => image.category === ICON_LIBRARY_CATEGORY && image.name === name,
      )
      if (existing) return existing.id
      const file = new Blob([lucideIconSvg(component)], { type: 'image/svg+xml' })
      const created = await imageLibraryApi.uploadImage(
        { name, category: ICON_LIBRARY_CATEGORY, file },
        { withData: false },
      )
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.list() })
      return created.id
    },
  })
}

export function useUpdateImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => imageLibraryApi.updateImage(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.list() })
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.data(id) })
      // The old blob URL was revoked, so every cached guid -> url map is stale.
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.byGuidAll() })
    },
  })
}

export function useDeleteImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => imageLibraryApi.deleteImage(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.list() })
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.data(id) })
      queryClient.invalidateQueries({ queryKey: imageLibraryKeys.byGuidAll() })
    },
  })
}
