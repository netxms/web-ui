<script setup>
/**
 * The failure banner for a write (save, create, delete). Unlike `QueryErrorState` it offers no
 * Retry: the user corrects the form and saves again. A 403 renders through `RestrictedState`,
 * muted and naming the missing right. The caller's class goes to whichever branch renders.
 */
import { computed } from 'vue'
import Message from 'primevue/message'
import RestrictedState from '@/components/common/RestrictedState.vue'

defineOptions({ name: 'MutationErrorState', inheritAttrs: false })

const props = defineProps({
  /** An `ApiError`/`Error`, or a composed string; only the object form gets the 403 treatment. */
  error: { type: [Object, Error, String], default: null },
  /** A `usePermissions().can` key naming the right this write needs, when known. */
  right: { type: String, default: '' },
})

const forbidden = computed(
  () => typeof props.error === 'object' && props.error !== null && props.error.status === 403,
)

const text = computed(() => {
  if (typeof props.error === 'string') return props.error
  return props.error?.message ?? 'The change could not be saved.'
})
</script>

<template>
  <RestrictedState v-if="error && forbidden" v-bind="$attrs" compact :right="right" />
  <Message v-else-if="error" v-bind="$attrs" severity="error" :closable="false">
    {{ text }}
  </Message>
</template>
