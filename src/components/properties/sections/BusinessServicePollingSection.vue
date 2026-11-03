<script setup>
import Checkbox from 'primevue/checkbox'

/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})
</script>

<template>
  <div class="business-service-polling-section">
    <fieldset class="form-fieldset">
      <legend>Polling</legend>
      <div class="form-fields">
        <label class="flag-row">
          <Checkbox v-model="draft.businessServicePolling.disableStatusPoll" :binary="true" />
          <span>Disable status polling</span>
        </label>
        <label class="flag-row">
          <Checkbox v-model="draft.businessServicePolling.disableConfPoll" :binary="true" />
          <span>Disable configuration polling</span>
        </label>
      </div>
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
  cursor: pointer;
  user-select: none;
}
</style>
