<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import Button from 'primevue/button'
import { useTheme } from '@/composables/useTheme'
import { buildSceneData, createSceneController } from './rack3dScene.js'

const props = defineProps({
  rackHeight: { type: Number, required: true },
  topBottomNumbering: { type: Boolean, default: false },
  elements: { type: Array, default: () => [] },
  /** Map<guid, dataUrl> */
  resolvedImages: { type: Object, default: () => ({}) },
  selectedElementId: { type: [Number, String], default: null },
})

const emit = defineEmits(['select-element'])

const { isDark } = useTheme()

const canvasRef = ref(null)
let controller = null

// getComputedStyle on a probe element normalizes any color syntax (oklch, color-mix, ...) to
// rgb(), which THREE.Color can parse.
function resolveCssColor(varName, fallback) {
  const probe = document.createElement('div')
  probe.style.color = `var(${varName})`
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color
  document.body.removeChild(probe)
  return rgb || fallback
}

function getTheme() {
  return {
    bgColor: resolveCssColor('--p-surface-ground', '#2b2b2b'),
    fgColor: resolveCssColor('--p-text-color', '#e0e0e0'),
  }
}

function rebuildScene() {
  if (!controller) return
  const data = buildSceneData(
    props.elements,
    { rackHeight: props.rackHeight, topBottomNumbering: props.topBottomNumbering },
    props.resolvedImages,
    getTheme(),
  )
  controller.setData(data)
  if (props.selectedElementId != null) controller.setSelection(props.selectedElementId)
}

onMounted(() => {
  controller = createSceneController(canvasRef.value, {
    onSelect: (id) => emit('select-element', id),
  })
  rebuildScene()
})

onBeforeUnmount(() => {
  controller?.dispose()
  controller = null
})

watch(
  () => [props.elements, props.resolvedImages, props.rackHeight, props.topBottomNumbering],
  rebuildScene,
  { deep: true },
)

watch(
  () => props.selectedElementId,
  (id) => controller?.setSelection(id),
)

watch(isDark, rebuildScene)

defineExpose({
  resetCamera: () => controller?.resetCamera(),
})
</script>

<template>
  <div class="rack-3d">
    <canvas ref="canvasRef" class="rack-3d__canvas" />
    <Button
      v-tooltip.bottom="'Reset view'"
      aria-label="Reset view"
      icon="pi pi-refresh"
      text
      rounded
      severity="secondary"
      size="small"
      class="rack-3d__reset"
      @click="controller?.resetCamera()"
    />
  </div>
</template>

<style scoped>
.rack-3d {
  position: relative;
  width: 100%;
  height: 100%;
}

.rack-3d__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.rack-3d__reset {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>
