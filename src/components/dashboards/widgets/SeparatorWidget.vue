<script setup>
import { computed } from 'vue'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})

const wrapStyle = computed(() => ({
  padding: `${cfg.value.topMargin ?? 0}px ${cfg.value.rightMargin ?? 0}px ${
    cfg.value.bottomMargin ?? 0
  }px ${cfg.value.leftMargin ?? 0}px`,
  background: cfg.value.background ?? 'transparent',
}))

const lineStyle = computed(() => ({
  height: `${cfg.value.lineWidth || 2}px`,
  background: cfg.value.foreground ?? 'var(--p-surface-border)',
}))
</script>

<template>
  <div class="separator-widget" :style="wrapStyle">
    <div class="separator-line" :style="lineStyle" />
  </div>
</template>

<style scoped>
.separator-widget {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 0 0.25rem;
}

.separator-line {
  width: 100%;
  border-radius: 1px;
}
</style>
