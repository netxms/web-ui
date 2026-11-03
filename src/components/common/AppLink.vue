<script setup>
/**
 * A real anchor, so ctrl/cmd+click, middle click and "Open in new tab" work natively. Inherits
 * colour and drops the underline, so wrapping markup does not change its look. Not for elements
 * containing a nested button (use `useNavTarget`).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'

const props = defineProps({
  to: { type: [Object, String], required: true },
  /** Set false when the parent handles navigation itself. */
  navigate: { type: Boolean, default: true },
})

/** Plain left click, before navigation. Modified clicks never emit. */
const emit = defineEmits(['activate'])

const router = useRouter()
const href = computed(() => resolveHref(props.to))

function onClick(event) {
  // Modified and middle clicks are left to the browser.
  if (!isPlainLeftClick(event)) return

  event.preventDefault()
  emit('activate', event)
  if (props.navigate) router.push(props.to)
}
</script>

<template>
  <a :href="href" class="app-link" @click="onClick">
    <slot />
  </a>
</template>

<style scoped>
.app-link {
  color: inherit;
  text-decoration: none;
}
</style>
