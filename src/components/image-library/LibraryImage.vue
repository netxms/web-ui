<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useImageData } from '@/queries/useImageLibraryQueries'

/**
 * An <img> for an image-library GUID that fetches the bytes only near the viewport: the library
 * is large and the WebAPI marks every response `no-store`. The root is the <img> itself, so
 * class and style fall through.
 */
const props = defineProps({
  /** null renders the placeholder only. */
  guid: { type: String, default: null },
  alt: { type: String, default: '' },
  /** Skips the viewport check. */
  eager: { type: Boolean, default: false },
  rootMargin: { type: String, default: '200px' },
})

// Keeps the element an <img> (stable layout and object-fit) without requesting anything.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const root = ref(null)
const inView = ref(props.eager)
let observer = null

onMounted(() => {
  if (inView.value) return
  // jsdom and older browsers have no IntersectionObserver; load rather than never show.
  if (typeof IntersectionObserver === 'undefined') {
    inView.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      inView.value = true
      observer?.disconnect()
      observer = null
    },
    { rootMargin: props.rootMargin },
  )
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const { data: url } = useImageData(
  computed(() => props.guid),
  { enabled: computed(() => inView.value) },
)

const loaded = computed(() => !!url.value)
</script>

<template>
  <img
    ref="root"
    :src="url ?? BLANK"
    :alt="loaded ? alt : ''"
    :aria-hidden="loaded ? undefined : 'true'"
    class="library-image"
    :class="{ 'library-image--pending': !loaded }"
  />
</template>

<style scoped>
.library-image--pending {
  background: var(--p-surface-100);
  border-radius: 3px;
}
</style>
