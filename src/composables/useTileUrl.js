import { computed } from 'vue'
import { useServerInfo } from '@/queries/useServerQueries'

const FALLBACK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export function useTileUrl() {
  const { data: serverInfo } = useServerInfo()

  const tileUrl = computed(() => {
    const base = serverInfo.value?.options?.tileServerURL
    if (!base) return FALLBACK_TILE_URL
    if (base.includes('{z}')) return base
    return base.replace(/\/?$/, '/') + '{z}/{x}/{y}.png'
  })

  return { tileUrl }
}
