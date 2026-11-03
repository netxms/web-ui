<script setup>
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import RadioButton from 'primevue/radiobutton'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { useZoneNames } from '@/queries/useObjectQueries'
import { getClassLabel } from '@/utils/objectUtils'
import { QUERYABLE_CLASSES, SEARCH_MODE_OPTIONS } from '@/utils/objectQueryScript'

/** The simple half of the Find Object tool, laid out like the legacy filter tab. */
const model = defineModel({ type: Object, required: true })

defineEmits(['submit'])

const zoneNames = useZoneNames()

// A server without zoning returns no Zone objects; an empty list hides the zone column.
const zoneOptions = computed(() =>
  [...zoneNames.value.entries()]
    .filter(([uin]) => Number.isFinite(uin))
    .map(([uin, name]) => ({ value: uin, label: `${name} (${uin})` }))
    .sort((a, b) => a.value - b.value),
)

const zoningEnabled = computed(() => zoneOptions.value.length > 0)

const classOptions = computed(() =>
  QUERYABLE_CLASSES.map((name) => ({ value: name, label: getClassLabel(name) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  ),
)
</script>

<template>
  <div class="filter-form">
    <fieldset class="filter-group filter-group--search">
      <legend class="group-legend">Search string</legend>
      <InputText
        v-model="model.text"
        placeholder="Name, address or any text on the object"
        class="search-input"
        autocomplete="off"
        @keydown.enter="$emit('submit')"
      />

      <div class="mode-list">
        <div v-for="option in SEARCH_MODE_OPTIONS" :key="option.value" class="mode-option">
          <RadioButton
            v-model="model.mode"
            :input-id="`mode-${option.value}`"
            :value="option.value"
            size="small"
          />
          <label :for="`mode-${option.value}`">{{ option.label }}</label>
        </div>
      </div>

      <div class="ip-range">
        <span class="field-label">IP range</span>
        <InputText
          v-model="model.ipFrom"
          placeholder="10.0.0.1"
          class="ip-input"
          autocomplete="off"
          aria-label="IP range start"
          @keydown.enter="$emit('submit')"
        />
        <span class="ip-dash">-</span>
        <InputText
          v-model="model.ipTo"
          placeholder="10.0.0.254"
          class="ip-input"
          autocomplete="off"
          aria-label="IP range end"
          @keydown.enter="$emit('submit')"
        />
      </div>

      <div class="root-picker">
        <span class="field-label">Search under</span>
        <ObjectPickerField
          v-model="model.rootObjectId"
          empty-label="Entire network"
          dialog-title="Select Search Root"
        />
      </div>
    </fieldset>

    <fieldset class="filter-group">
      <legend class="group-legend">Class filter</legend>
      <MultiSelect
        v-model="model.classes"
        :options="classOptions"
        option-label="label"
        option-value="value"
        display="chip"
        filter
        show-clear
        placeholder="Any class"
        class="multi"
        :max-selected-labels="4"
        selected-items-label="{0} classes"
      />
    </fieldset>

    <fieldset v-if="zoningEnabled" class="filter-group">
      <legend class="group-legend">Zone filter</legend>
      <MultiSelect
        v-model="model.zones"
        :options="zoneOptions"
        option-label="label"
        option-value="value"
        display="chip"
        show-clear
        placeholder="Any zone"
        class="multi"
        :max-selected-labels="4"
        selected-items-label="{0} zones"
      />
      <p class="group-note">Objects that belong to no zone always match.</p>
    </fieldset>
  </div>
</template>

<style scoped>
.filter-form {
  display: grid;
  grid-template-columns: minmax(20rem, 2fr) minmax(14rem, 1fr) minmax(14rem, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (width <= 60rem) {
  .filter-form {
    grid-template-columns: 1fr;
  }
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0.625rem 0.75rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  min-width: 0;
}

.group-legend {
  padding: 0 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.group-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.search-input {
  width: 100%;
}

.mode-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.mode-option label {
  cursor: pointer;
}

.ip-range,
.root-picker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.field-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.ip-input {
  width: 9rem;
}

.ip-dash {
  color: var(--p-text-muted-color);
}

.multi {
  width: 100%;
}
</style>
