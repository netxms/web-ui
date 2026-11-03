<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import StatusTag from '@/components/common/StatusTag.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import { getStatusHexColor } from '@/utils/objectUtils'
import { getClassIconCodepoint } from '@/utils/topologyUtils'

const PASSIVE_COLORS = {
  PDU: '#5c6bc0',
  PatchPanel: '#00897b',
  Organizer: '#8d6e63',
  FilterPanel: '#7b1fa2',
}

const ORIENTATION_LABELS = {
  full: 'Full depth',
  front: 'Front only',
  back: 'Back only',
}

const props = defineProps({
  element: { type: Object, required: true },
  resolvedImages: { type: Object, default: () => ({}) },
  rackMode: { type: String, default: 'front-back' },
  /**
   * For "Go to object" ctrl/middle-click; a plain click still emits `go-to-object`.
   * @type {import('vue').PropType<(objectId: number) => object>}
   */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['edit', 'remove', 'close', 'go-to-object'])

const { navBindings } = useNavTarget()

const isPassive = computed(() => !!props.element.passiveType)

const statusStripColor = computed(() => {
  if (isPassive.value) return PASSIVE_COLORS[props.element.passiveType] ?? '#607d8b'
  return getStatusHexColor(props.element.objectStatus ?? 5)
})

const displayName = computed(
  () => props.element.label || props.element.objectName || props.element.passiveType || '—',
)

const iconCodepoint = computed(() => {
  if (isPassive.value) return null
  return getClassIconCodepoint(props.element.objectClass ?? 'Node')
})

const frontImageUrl = computed(() =>
  props.element.frontImageGuid ? props.resolvedImages[props.element.frontImageGuid] : null,
)

const backImageUrl = computed(() =>
  props.element.backImageGuid ? props.resolvedImages[props.element.backImageGuid] : null,
)

const showImages = computed(() => frontImageUrl.value || backImageUrl.value)
</script>

<template>
  <div class="rack-element-panel">
    <div class="panel-header" :style="{ borderLeftColor: statusStripColor }">
      <span v-if="iconCodepoint" class="panel-header__icon panel-header__icon--font">
        {{ iconCodepoint }}
      </span>
      <span class="panel-header__name">{{ displayName }}</span>
      <Button
        aria-label="Close element panel"
        icon="pi pi-times"
        text
        rounded
        severity="secondary"
        size="small"
        class="panel-header__close"
        @click="emit('close')"
      />
    </div>

    <div class="panel-body">
      <div v-if="!isPassive" class="panel-row">
        <span class="panel-row__label">Status</span>
        <StatusTag :status="element.objectStatus ?? 5" class="panel-row__tag" />
      </div>

      <div class="panel-row">
        <span class="panel-row__label">{{ isPassive ? 'Type' : 'Class' }}</span>
        <span class="panel-row__value">{{
          isPassive ? element.passiveType : (element.objectClass ?? 'Node')
        }}</span>
      </div>

      <div class="panel-row">
        <span class="panel-row__label">Position</span>
        <span class="panel-row__value">U{{ element.slot }}, {{ element.heightU }}U tall</span>
      </div>

      <div v-if="rackMode === 'front-back'" class="panel-row">
        <span class="panel-row__label">Side</span>
        <span class="panel-row__value">{{
          ORIENTATION_LABELS[element.orientation] ?? element.orientation
        }}</span>
      </div>

      <div v-if="showImages" class="panel-images">
        <div v-if="frontImageUrl" class="panel-image-cell">
          <span class="panel-image-cell__label">Front</span>
          <img :src="frontImageUrl" class="panel-image-cell__img" alt="front" />
        </div>
        <div v-if="backImageUrl" class="panel-image-cell">
          <span class="panel-image-cell__label">Back</span>
          <img :src="backImageUrl" class="panel-image-cell__img" alt="back" />
        </div>
      </div>
    </div>

    <div v-if="!isPassive && element.objectId" class="panel-actions">
      <span class="panel-actions__label">Actions</span>
      <Button
        label="Go to object"
        icon="pi pi-arrow-right"
        icon-pos="right"
        size="small"
        severity="secondary"
        outlined
        v-bind="
          navBindings(targetFor?.(element.objectId) ?? null, () =>
            emit('go-to-object', element.objectId),
          )
        "
      />
    </div>

    <div class="panel-footer">
      <Button
        label="Edit"
        icon="pi pi-pencil"
        size="small"
        severity="secondary"
        outlined
        @click="emit('edit', element.id)"
      />
      <Button
        label="Remove"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        text
        @click="emit('remove', element.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.rack-element-panel {
  width: 268px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  overflow-y: auto;
  font-size: 0.8125rem;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  border-left: 3px solid transparent;
  flex-shrink: 0;
}

.panel-header__icon {
  font-size: 1rem;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
}

.panel-header__icon--font {
  font-family: 'primeicons', sans-serif;
  font-style: normal;
}

.panel-header__name {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.panel-header__close {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0.25rem 0;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.panel-row:last-child {
  border-bottom: none;
}

.panel-row__label {
  width: 4.5rem;
  flex-shrink: 0;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.panel-row__value {
  flex: 1;
  min-width: 0;
}

.panel-row__tag {
  font-size: 0.6875rem;
}

.panel-images {
  display: flex;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.panel-image-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.panel-image-cell__label {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  text-align: center;
}

.panel-image-cell__img {
  width: 100%;
  max-height: 72px;
  object-fit: contain;
  border: 1px solid var(--p-content-border-color);
  border-radius: 3px;
  background: var(--p-surface-50);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.panel-actions__label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  flex: 1;
}

.panel-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}
</style>
