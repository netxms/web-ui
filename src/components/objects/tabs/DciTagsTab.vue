<script setup>
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import DetailCard from '@/components/layout/DetailCard.vue'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
defineProps({
  form: { type: Object, required: true },
})
</script>

<template>
  <div class="tags-tab">
    <div class="tab-cards-grid">
      <DetailCard title="Tags">
        <FormField label="User Tag" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.userTag"
            class="form-input"
            placeholder="Optional user tag"
          />
        </FormField>
        <FormField label="System Tag" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.systemTag"
            class="form-input"
            disabled
            placeholder="System-managed"
          />
        </FormField>
        <FormField label="AI Hint" class="form-field--top" v-slot="{ id }">
          <Textarea
            :id="id"
            v-model="form.aiHint"
            auto-resize
            rows="2"
            class="form-input"
            placeholder="Optional context hint for AI analysis"
          />
        </FormField>
      </DetailCard>

      <DetailCard title="Comments" :wide="true">
        <Textarea
          v-model="form.comments"
          auto-resize
          rows="4"
          class="comments-input"
          placeholder="Notes about this data collection item..."
        />
      </DetailCard>
    </div>
  </div>
</template>

<style scoped>
.tags-tab {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.tab-cards-grid {
  columns: 2;
  column-gap: 1rem;
  padding: 1.5rem;
}

.tab-cards-grid :deep(.detail-card) {
  break-inside: avoid;
  margin-bottom: 1rem;
}

.tab-cards-grid :deep(.detail-card--wide) {
  column-span: all;
}

.form-field {
  display: flex;
  /* Overrides `column` from the global .form-field in forms.css. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

.form-field--top {
  align-items: flex-start;
  padding-top: 0.5rem;
}

/* `:deep` reaches the FormField label; bare `label` covers hand-rolled markup. */
.form-field label,
.form-field :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.comments-input {
  width: 100%;
  resize: none;
  margin: 0.5rem 0 0.25rem;
}
</style>
