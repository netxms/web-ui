import { watch, onUnmounted, toValue } from 'vue'
import { setDetailTitle } from '@/utils/pageTitle'

/**
 * The entity part of the browser tab title; cleared on unmount.
 *
 * @example
 * usePageTitle(() => selectedObject.value?.name)
 *
 * @param {import('vue').MaybeRefOrGetter<string|null|undefined>} source
 */
export function usePageTitle(source) {
  watch(
    () => toValue(source),
    (value) => setDetailTitle(value ?? ''),
    { immediate: true },
  )

  onUnmounted(() => setDetailTitle(''))
}
