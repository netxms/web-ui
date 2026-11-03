<script>
// One wrapper per import function, or every re-render remounts the view. Module-wide because
// hosts key the container by view: a reopened view reuses a resolved wrapper and skips Suspense.
const asyncCache = new Map()
</script>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import Skeleton from 'primevue/skeleton'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  component: {
    type: [Object, Function],
    default: null,
  },
  viewProps: {
    type: Object,
    default: () => ({}),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  /** The view's id; turns on scroll memory. */
  stateKey: {
    type: String,
    default: null,
  },
})

const resolvedComponent = computed(() => {
  if (!props.component) return null
  if (typeof props.component === 'function') {
    let cached = asyncCache.get(props.component)
    if (!cached) {
      cached = defineAsyncComponent(props.component)
      asyncCache.set(props.component, cached)
    }
    return cached
  }
  return props.component
})

// Content arrives in pieces (component, then its queries), so a remembered offset waits until
// the content is tall enough, up to RESTORE_WAIT_MS and never past the user's first input.

const containerRef = ref(null)

const RESTORE_WAIT_MS = 2000

let pendingScrollTop = 0
let giveUpAt = 0
let restoreFrame = 0

function restoreScroll(top) {
  pendingScrollTop = top
  // Only a reset to another object finds the element already there.
  if (!top && containerRef.value) containerRef.value.scrollTop = 0
}

function applyPendingScroll() {
  restoreFrame = 0
  const el = containerRef.value
  if (!pendingScrollTop || !el) return
  if (el.scrollHeight - el.clientHeight >= pendingScrollTop) {
    el.scrollTop = pendingScrollTop
    pendingScrollTop = 0
  } else if (performance.now() < giveUpAt) {
    restoreFrame = requestAnimationFrame(applyPendingScroll)
  } else {
    pendingScrollTop = 0
  }
}

function cancelPendingScroll() {
  pendingScrollTop = 0
  cancelAnimationFrame(restoreFrame)
}

if (props.stateKey) {
  useWorkingState(`scroll:${props.stateKey}`, {
    object: {
      // An offset still waiting is the one to keep, not wherever the half-built page is.
      scrollTop: {
        get: () => pendingScrollTop || containerRef.value?.scrollTop || 0,
        set: restoreScroll,
      },
    },
  })
  onMounted(() => {
    giveUpAt = performance.now() + RESTORE_WAIT_MS
    applyPendingScroll()
  })
  onBeforeUnmount(() => cancelAnimationFrame(restoreFrame))
}
</script>

<template>
  <!-- The listeners only cancel a pending scroll restore; nothing here activates. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div
    ref="containerRef"
    class="view-container"
    @wheel.passive="cancelPendingScroll"
    @touchstart.passive="cancelPendingScroll"
    @keydown="cancelPendingScroll"
    @pointerdown="cancelPendingScroll"
  >
    <template v-if="loading || !resolvedComponent">
      <div class="view-container-loading">
        <Skeleton height="2rem" class="mb-2" />
        <Skeleton height="1rem" width="70%" class="mb-2" />
        <Skeleton height="1rem" width="50%" class="mb-4" />
        <Skeleton height="20rem" />
      </div>
    </template>
    <template v-else>
      <Suspense>
        <template #default>
          <component :is="resolvedComponent" v-bind="viewProps" />
        </template>
        <template #fallback>
          <div class="view-container-loading">
            <Skeleton height="2rem" class="mb-2" />
            <Skeleton height="1rem" width="70%" class="mb-2" />
            <Skeleton height="1rem" width="50%" class="mb-4" />
            <Skeleton height="20rem" />
          </div>
        </template>
      </Suspense>
    </template>
  </div>
</template>

<style scoped>
.view-container {
  flex: 1;
  min-height: 0;
  /* Views with `height: 100%` scroll internally and never trigger this; document-style views
     (Status, overviews) grow with their content and scroll here. */
  overflow-y: auto;
  overflow-x: hidden;
}

.view-container-loading {
  padding: 0;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.mb-4 {
  margin-bottom: 1rem;
}
</style>
