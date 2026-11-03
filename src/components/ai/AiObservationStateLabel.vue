<script setup>
import { computed } from 'vue'
import { observationState } from '@/utils/aiOperatorDisplay'

const props = defineProps({
  /** 'new' | 'acknowledged' | 'dismissed' */
  state: { type: String, default: null },
})

const display = computed(() => observationState(props.state))
</script>

<template>
  <span class="observation-state" :style="{ color: display.color }">
    <i :class="display.icon" />
    {{ display.label }}
  </span>
</template>

<style scoped>
.observation-state {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

/* A fixed slot, so the labels line up whichever icon a row has. */
.observation-state i {
  flex-shrink: 0;
  width: 1rem;
  font-size: 0.875rem;
  text-align: center;
}

/* Nearly every row carries this one, so it stays a small mark. */
.observation-state i.pi-circle-fill {
  font-size: 0.4375rem;
}
</style>
