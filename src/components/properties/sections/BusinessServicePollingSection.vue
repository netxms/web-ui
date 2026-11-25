<script setup>
import Checkbox from 'primevue/checkbox'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'

const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

// DCF_DISABLE_STATUS_POLL and DCF_DISABLE_CONF_POLL in the object's flags.
const FLAGS = [
  { mask: 0x01, label: 'Disable status polling' },
  { mask: 0x02, label: 'Disable configuration polling' },
]

function hasFlag(mask) {
  return ((props.object.flags ?? 0) & mask) !== 0
}
</script>

<template>
  <div class="business-service-polling-section">
    <fieldset class="form-fieldset">
      <legend>Polling</legend>
      <UnderConstructionOverlay message="The server does not allow changing these options yet.">
        <div class="form-fields">
          <label v-for="flag in FLAGS" :key="flag.mask" class="flag-row">
            <Checkbox :model-value="hasFlag(flag.mask)" binary disabled />
            <span>{{ flag.label }}</span>
          </label>
        </div>
      </UnderConstructionOverlay>
    </fieldset>
  </div>
</template>

<style scoped>
.business-service-polling-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.flag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  user-select: none;
}
</style>
