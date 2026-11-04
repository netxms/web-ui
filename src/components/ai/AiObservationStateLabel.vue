<script setup>
import { computed } from 'vue'
import AiIconLabel from '@/components/ai/AiIconLabel.vue'
import { observationState } from '@/utils/aiOperatorDisplay'

const props = defineProps({
  /** 'new' | 'acknowledged' | 'dismissed' */
  state: { type: String, default: null },
})

const display = computed(() => observationState(props.state))
</script>

<template>
  <AiIconLabel :display="display" />
</template>
