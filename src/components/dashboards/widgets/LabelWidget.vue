<script setup>
import { computed } from 'vue'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})

const fontSize = computed(() => {
  const map = { sm: '0.8125rem', md: '1rem', lg: '1.25rem', xl: '1.5rem' }
  return map[cfg.value.fontSize] ?? '1rem'
})

const style = computed(() => ({
  fontSize: fontSize.value,
  textAlign: cfg.value.align ?? 'center',
  justifyContent:
    { left: 'flex-start', center: 'center', right: 'flex-end' }[cfg.value.align ?? 'center'] ??
    'center',
  color: cfg.value.foreground ?? undefined,
  background: cfg.value.background ?? undefined,
}))
</script>

<template>
  <div class="label-widget" :style="style">
    {{ cfg.text || '' }}
  </div>
</template>

<style scoped>
.label-widget {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 0.75rem;
  font-weight: 600;
  color: var(--p-text-color);
  white-space: pre-wrap;
  overflow: hidden;
  border-radius: 6px;
}
</style>
