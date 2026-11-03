import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { Router } from 'lucide-vue-next'

vi.mock('@/api/imageLibraryApi', () => ({
  getImages: vi.fn(),
  getImage: vi.fn(),
  getImageDataUrl: vi.fn(),
  getImageDataUrls: vi.fn(),
  uploadImage: vi.fn(),
  updateImage: vi.fn(async (id) => ({ id })),
  deleteImage: vi.fn(async () => {}),
}))

const { imageLibraryKeys, useUpdateImage, useDeleteImage, useLibraryImageForIcon } =
  await import('../useImageLibraryQueries')
const imageLibraryApi = await import('@/api/imageLibraryApi')

// Update and delete revoke the blob URL behind a guid, so the whole `byGuid` prefix is stale.
describe('image library mutation invalidation', () => {
  let queryClient

  function withMutation(composable) {
    let api
    mount(
      defineComponent({
        setup() {
          api = composable()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  const seed = () => {
    queryClient.setQueryData(imageLibraryKeys.byGuid(['a-guid', 'b-guid']), {
      'a-guid': 'blob:one',
      'b-guid': 'blob:two',
    })
    queryClient.setQueryData(imageLibraryKeys.data('a-guid'), 'blob:one')
    queryClient.setQueryData(imageLibraryKeys.list(), [])
  }

  const invalidated = (key) => queryClient.getQueryState(key)?.isInvalidated === true

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false } },
    })
    seed()
  })

  it('update invalidates byGuid maps that do not name the edited guid in their key', async () => {
    const { mutateAsync } = withMutation(useUpdateImage)
    await mutateAsync({ id: 'a-guid', name: 'renamed' })

    expect(invalidated(imageLibraryKeys.byGuid(['a-guid', 'b-guid']))).toBe(true)
    expect(invalidated(imageLibraryKeys.data('a-guid'))).toBe(true)
    expect(invalidated(imageLibraryKeys.list())).toBe(true)
  })

  it('delete invalidates byGuid maps and the deleted guid data entry', async () => {
    const { mutateAsync } = withMutation(useDeleteImage)
    await mutateAsync('a-guid')

    expect(invalidated(imageLibraryKeys.byGuid(['a-guid', 'b-guid']))).toBe(true)
    expect(invalidated(imageLibraryKeys.data('a-guid'))).toBe(true)
    expect(invalidated(imageLibraryKeys.list())).toBe(true)
  })
})

// The server stores tool icons as guids only.
describe('useLibraryImageForIcon', () => {
  let queryClient

  function withMutation() {
    let api
    mount(
      defineComponent({
        setup() {
          api = useLibraryImageForIcon()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('reuses an image of the same name in the icons category', async () => {
    imageLibraryApi.getImages.mockResolvedValue([
      { id: 'other-category', name: 'Router', category: 'Network' },
      { id: 'existing', name: 'Router', category: 'Icons' },
    ])
    const { mutateAsync } = withMutation()

    await expect(mutateAsync({ name: 'Router', component: Router })).resolves.toBe('existing')
    expect(imageLibraryApi.uploadImage).not.toHaveBeenCalled()
  })

  it('uploads the icon as SVG into the icons category when it is not there yet', async () => {
    imageLibraryApi.getImages.mockResolvedValue([])
    imageLibraryApi.uploadImage.mockResolvedValue({ id: 'new-guid' })
    const { mutateAsync } = withMutation()

    await expect(mutateAsync({ name: 'Router', component: Router })).resolves.toBe('new-guid')
    const [image, options] = imageLibraryApi.uploadImage.mock.calls[0]
    expect(image).toMatchObject({ name: 'Router', category: 'Icons' })
    expect(image.file.type).toBe('image/svg+xml')
    expect(options).toEqual({ withData: false })
  })
})
