<script setup>
import { computed } from 'vue'
import ResolvedIcon from '@/components/common/ResolvedIcon.vue'
import { useObjectIcons } from '@/composables/useObjectIcons'

/**
 * The item's library image (`item.iconImage`) once loaded, else its PrimeIcons class. One-colour
 * images are drawn in the menu's icon colour, as object icons are.
 */
const props = defineProps({
  item: { type: Object, required: true },
})

const icons = useObjectIcons()
// Hosts preload their items' images; this covers any that did not.
icons?.want(() => [props.item.iconImage])

const image = computed(() => icons?.resolveImage(props.item.iconImage) ?? null)
</script>

<template>
  <ResolvedIcon v-if="image" :icon="image" size="0.875rem" />
  <span v-else :class="item.icon" />
</template>
