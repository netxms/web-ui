<script setup>
defineProps({
  /** @type {import('vue').PropType<{ label: string, icon: string, color?: string, iconColor?: string }>} */
  display: { type: Object, required: true },
})
</script>

<template>
  <span class="ai-icon-label" :style="{ color: display.color }">
    <i :class="display.icon" :style="{ color: display.iconColor }" />
    {{ display.label }}
  </span>
</template>

<style scoped>
.ai-icon-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

/* A fixed slot, so the labels line up whichever icon a row has. */
.ai-icon-label i {
  flex-shrink: 0;
  width: 1rem;
  font-size: 0.875rem;
  text-align: center;
}

/* Nearly every row carries this one, so it stays a small mark. */
.ai-icon-label i.pi-circle-fill {
  font-size: 0.4375rem;
}
</style>
