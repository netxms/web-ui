import { computed, inject, provide, shallowRef, toValue, watch, watchEffect } from 'vue'
import { useQueries } from '@tanstack/vue-query'
import { useObjectCategories } from '@/queries/useObjectCategoryQueries'
import { imageLibraryKeys } from '@/queries/useImageLibraryQueries'
import { STATIC_TIER } from '@/queries/config'
import { getImageBlobInfo, getImageDataUrl } from '@/api/imageLibraryApi'
import { useObjectIconStore } from '@/stores/objectIconStore'
import {
  ICON_SURFACE,
  builtinIconComponent,
  customImageGuid,
  indexCategories,
  validGuid,
} from '@/utils/objectIcons'
import { analyzeIconImage } from '@/utils/iconImageAnalysis'

/** Injection key of the registry; exported for specs that stand in their own. */
export const OBJECT_ICON_REGISTRY_KEY = Symbol('objectIcons')

/**
 * One instance per signed-in session (provided by `DefaultLayout`), so a large tree shares one
 * query per image instead of an observer per row. Category icons load up front, as in the
 * legacy client; map images only when a view asks for them (`want`).
 */
export function createObjectIconRegistry() {
  const store = useObjectIconStore()
  const { data: categories } = useObjectCategories()

  const categoriesById = computed(() => indexCategories(categories.value, store.preview))

  /** Guids some view asked for. Only grows: bytes are cached per guid in the API layer anyway. */
  const requested = shallowRef(new Set())

  function request(guids) {
    const missing = (guids ?? []).map(validGuid).filter((g) => g && !requested.value.has(g))
    if (missing.length) requested.value = new Set([...requested.value, ...missing])
  }

  const loadGuids = computed(() => {
    const guids = new Set(requested.value)
    for (const category of categoriesById.value.values()) {
      const icon = validGuid(category.iconImageId)
      if (icon) guids.add(icon)
    }
    return [...guids]
  })

  // Same key as `useImageData`, so `LibraryImage` and the image library's update / delete
  // invalidations reach these too. `select` tags each result with its guid: the result list
  // can trail the query list by a tick, so matching them up by index is not safe.
  const imageResults = useQueries({
    queries: computed(() =>
      loadGuids.value.map((guid) => ({
        queryKey: imageLibraryKeys.data(guid),
        queryFn: () => getImageDataUrl(guid),
        select: (url) => ({ guid, url }),
        ...STATIC_TIER,
      })),
    ),
  })

  /** guid -> blob URL, or null for an image that could not be fetched (deleted, no access). */
  const urlByGuid = computed(() => {
    const urls = new Map()
    for (const result of imageResults.value) {
      if (result.data) urls.set(result.data.guid, result.data.url ?? null)
    }
    return urls
  })

  /** blob URL -> analysis. Keyed by URL: replacing an image's bytes mints a new one. */
  const analyses = shallowRef(new Map())
  const analyzing = new Set()

  watch(
    urlByGuid,
    (urls) => {
      for (const [guid, url] of urls) {
        if (!url || analyses.value.has(url) || analyzing.has(url)) continue
        analyzing.add(url)
        analyzeIconImage(url, getImageBlobInfo(guid) ?? {}).then((analysis) => {
          analyzing.delete(url)
          const next = new Map(analyses.value)
          next.set(url, analysis)
          analyses.value = next
        })
      }
    },
    { immediate: true },
  )

  /**
   * @param {string|null} guid
   * @returns {{ guid: string|null, url: string|null, analysis: object|null,
   *   loading: boolean, missing: boolean, blobInfo: object|null }}
   */
  function imageState(guid) {
    const id = validGuid(guid)
    if (!id) return { guid: null, url: null, analysis: null, loading: false, missing: false }
    const fetched = urlByGuid.value.has(id)
    const url = urlByGuid.value.get(id) ?? null
    const analysis = url ? (analyses.value.get(url) ?? null) : null
    return {
      guid: id,
      url,
      analysis,
      loading: !fetched || (url != null && analysis == null),
      missing: fetched && url == null,
      blobInfo: url ? getImageBlobInfo(id) : null,
    }
  }

  /**
   * Null until the image is both fetched and analysed, and for an image the library no longer
   * has.
   *
   * @param {string|null} guid
   * @returns {{ kind: 'glyph'|'picture', guid: string, url: string, analysis: object }|null}
   */
  function resolveImage(guid) {
    const id = validGuid(guid)
    if (!id) return null
    const url = urlByGuid.value.get(id)
    const analysis = url ? analyses.value.get(url) : null
    return analysis ? { kind: analysis.style, guid: id, url, analysis } : null
  }

  /**
   * Built-in until the custom image is fetched and analysed, so a row never flashes an
   * untinted glyph. The server deletes library images without checking who uses them, so a
   * dangling guid quietly stays built-in. `force` (the preview panel) ignores the opt-out.
   *
   * @param {object} object
   * @param {string} surface - an ICON_SURFACE value
   * @param {Map<number, object>} byId - categories, as `indexCategories` builds them
   * @param {{ force?: boolean }} [options]
   * @returns {{ kind: 'builtin', component: object }
   *   | { kind: 'glyph'|'picture', guid: string, url: string, analysis: object, component: object }}
   */
  function resolveWith(object, surface, byId, { force = false } = {}) {
    const component = builtinIconComponent(object, surface)
    const builtin = { kind: 'builtin', component }
    if (!object) return builtin
    const categoryId = object.category ?? object.objectCategory ?? 0
    const previewed = store.preview != null && categoryId === store.preview.categoryId
    if (!force && !store.showCustom && !previewed) return builtin
    const image = resolveImage(customImageGuid(object, surface, byId))
    return image ? { ...image, component } : builtin
  }

  /**
   * @param {object} object
   * @param {string} [surface] - an ICON_SURFACE value
   */
  function resolve(object, surface = ICON_SURFACE.SMALL) {
    return resolveWith(object, surface, categoriesById.value)
  }

  /**
   * Load images for as long as the calling scope lives.
   *
   * @param {import('vue').MaybeRefOrGetter<string[]>} guids
   */
  function want(guids) {
    watchEffect(() => request(toValue(guids)))
  }

  return { categoriesById, resolve, resolveWith, resolveImage, imageState, want, request }
}

export function provideObjectIcons() {
  const registry = createObjectIconRegistry()
  provide(OBJECT_ICON_REGISTRY_KEY, registry)
  return registry
}

/**
 * Everything below the calling component draws icons as if one category had the draft
 * images, and draws custom images even when the user switched them off.
 *
 * @param {ReturnType<typeof createObjectIconRegistry>} base
 * @param {import('vue').MaybeRefOrGetter<{ categoryId: number, iconImageId: string|null,
 *   mapImageId: string|null }|null>} override - null previews the stored categories
 * @param {import('vue').MaybeRefOrGetter<string[]>} [extraGuids] - other images to load
 */
export function providePreviewObjectIcons(base, override, extraGuids = () => []) {
  const categoriesById = computed(() => {
    const draft = toValue(override)
    return draft
      ? indexCategories([...base.categoriesById.value.values()], draft)
      : base.categoriesById.value
  })
  base.want(() => {
    const draft = toValue(override)
    return [draft?.iconImageId, draft?.mapImageId, ...(toValue(extraGuids) ?? [])]
  })
  const registry = {
    ...base,
    categoriesById,
    resolve: (object, surface = ICON_SURFACE.SMALL) =>
      base.resolveWith(object, surface, categoriesById.value, { force: true }),
  }
  provide(OBJECT_ICON_REGISTRY_KEY, registry)
  return registry
}

/**
 * Null outside the signed-in layout (tests, the login page).
 *
 * @returns {ReturnType<typeof createObjectIconRegistry>|null}
 */
export function useObjectIcons() {
  return inject(OBJECT_ICON_REGISTRY_KEY, null)
}
