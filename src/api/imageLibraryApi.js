import { get, getBlob, put, postRaw, putRaw, del } from '@/api/client'
import { mapConcurrent } from '@/utils/concurrencyLimit'

function normalize(img) {
  return {
    id: img.guid,
    name: img.name,
    category: img.category,
    mimeType: img.mimeType,
    protected: img.isProtected ?? false,
  }
}

/**
 * guid -> blob URL, one per guid (the bytes change only when the image is replaced). Entries are
 * revoked and dropped when the image is updated or deleted.
 */
const dataUrlCache = new Map()

/** guid -> `{ size, type }` of the blob behind its cached URL. Kept and dropped with it. */
const blobInfoCache = new Map()

function releaseDataUrl(guid) {
  const url = dataUrlCache.get(guid)
  if (url == null) return
  URL.revokeObjectURL(url)
  dataUrlCache.delete(guid)
  blobInfoCache.delete(guid)
}

/**
 * Byte size and MIME type of an image already resolved by `getImageDataUrl`, or null before
 * that. Read from the blob itself: a `fetch` of the blob URL would need `blob:` in the CSP's
 * `connect-src`, and the metadata endpoint reports no size.
 *
 * @param {string} guid
 * @returns {{ size: number, type: string }|null}
 */
export function getImageBlobInfo(guid) {
  return blobInfoCache.get(guid) ?? null
}

/**
 * One image's bytes as a blob URL, or null. Call it per displayed image: the WebAPI sends
 * `Cache-Control: no-store`, so only this cache spares a second download.
 *
 * @param {string} guid
 * @returns {Promise<string|null>}
 */
export async function getImageDataUrl(guid) {
  const cached = dataUrlCache.get(guid)
  if (cached != null) return cached
  try {
    const blob = await getBlob(`/v1/image-library/${guid}/data`)
    const url = URL.createObjectURL(blob)
    dataUrlCache.set(guid, url)
    blobInfoCache.set(guid, { size: blob.size, type: blob.type })
    return url
  } catch {
    return null
  }
}

/**
 * Resolve several guids at once, at most a few requests in flight.
 *
 * @param {string[]} guids
 * @returns {Promise<Record<string, string|null>>} guid -> blob URL
 */
export async function getImageDataUrls(guids) {
  const list = [...new Set(guids)]
  const urls = await mapConcurrent(list, (guid) => getImageDataUrl(guid))
  return Object.fromEntries(list.map((guid, i) => [guid, urls[i]]))
}

/** Metadata only: resolving every image's bytes would download the whole library (tens of MB). */
export async function getImages() {
  const list = await get('/v1/image-library')
  return list.map(normalize)
}

/** One image's metadata plus its bytes. Fine for a single image the caller is showing. */
export async function getImage(id) {
  const img = await get(`/v1/image-library/${id}`)
  const normalized = normalize(img)
  return { ...normalized, dataUrl: await getImageDataUrl(id) }
}

/**
 * @param {{ name: string, category?: string, file: Blob }} image
 * @param {{ withData?: boolean }} [options] - `withData: false` skips downloading the bytes
 *   back, for bulk imports that show nothing of what they upload
 */
export async function uploadImage({ name, category, file }, { withData = true } = {}) {
  const params = new URLSearchParams({ name })
  if (category) params.append('category', category)
  const result = await postRaw(`/v1/image-library?${params}`, file, {
    headers: { 'Content-Type': file.type },
  })
  const normalized = normalize(result)
  return withData ? { ...normalized, dataUrl: await getImageDataUrl(normalized.id) } : normalized
}

export async function updateImage(id, { name, category, file }) {
  const params = new URLSearchParams()
  if (name != null) params.append('name', name)
  if (category != null) params.append('category', category)
  const qs = params.toString() ? `?${params}` : ''

  let result
  if (file) {
    result = await putRaw(`/v1/image-library/${id}${qs}`, file, {
      headers: { 'Content-Type': file.type },
    })
  } else {
    result = await put(`/v1/image-library/${id}${qs}`)
  }
  const normalized = normalize(result)
  // The bytes may have been replaced, so the cached URL is stale.
  releaseDataUrl(normalized.id)
  return { ...normalized, dataUrl: await getImageDataUrl(normalized.id) }
}

export async function deleteImage(id) {
  await del(`/v1/image-library/${id}`)
  releaseDataUrl(id)
}
