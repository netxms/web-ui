import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { userPrefs } from '@/utils/appStorage'

const SHOW_CUSTOM_FIELD = 'objectIcons.showCustom'

function readShowCustom() {
  return userPrefs.get(SHOW_CUSTOM_FIELD) !== false
}

/**
 * `preview`: a category's draft images, laid over the stored ones everywhere until applied or
 * discarded. Session only: a reload is a discard.
 */
export const useObjectIconStore = defineStore('objectIcons', () => {
  const showCustom = ref(readShowCustom())

  watch(userPrefs.revision, () => {
    showCustom.value = readShowCustom()
  })

  /** Only the opt-out is stored. */
  function setShowCustom(value) {
    showCustom.value = !!value
    userPrefs.set(SHOW_CUSTOM_FIELD, value ? undefined : false)
  }

  /**
   * @type {import('vue').Ref<{ categoryId: number, name: string,
   *   iconImageId: string|null, mapImageId: string|null }|null>}
   */
  const preview = ref(null)
  const isPreviewing = computed(() => preview.value != null)

  /**
   * @param {{ categoryId: number, name: string, iconImageId?: string|null,
   *   mapImageId?: string|null }} draft
   */
  function startPreview(draft) {
    preview.value = {
      categoryId: draft.categoryId,
      name: draft.name ?? '',
      iconImageId: draft.iconImageId ?? null,
      mapImageId: draft.mapImageId ?? null,
    }
  }

  function stopPreview() {
    preview.value = null
  }

  return { showCustom, setShowCustom, preview, isPreviewing, startPreview, stopPreview }
})
