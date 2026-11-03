<script setup>
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Message from 'primevue/message'
import GeoAreaPickerButton from '@/components/geographical-areas/GeoAreaPickerButton.vue'
import FormField from '@/components/common/FormField.vue'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const LOCATION_TYPES = [
  { value: 0, label: 'Unset' },
  { value: 1, label: 'Manual' },
]

const CONTROL_MODES = [
  { value: 0, label: 'No control' },
  { value: 1, label: 'Alert when within restricted area' },
  { value: 2, label: 'Alert when outside allowed area' },
]

const SYSTEM_SET_LABELS = { 2: 'GPS receiver', 3: 'Network' }

function currentLocationType() {
  return props.draft.geoLocation?.type ?? 0
}

function isSystemSetLocation() {
  const t = currentLocationType()
  return t === 2 || t === 3
}

function onLocationTypeChange(value) {
  if (value === 0) {
    props.draft.geoLocation = null
  } else if (value === 1) {
    props.draft.geoLocation = {
      type: 1,
      latitude: props.draft.geoLocation?.latitude ?? 0,
      longitude: props.draft.geoLocation?.longitude ?? 0,
      accuracy: props.draft.geoLocation?.accuracy ?? 0,
      timestamp: props.draft.geoLocation?.timestamp ?? null,
    }
  }
}

function clearPostalAddress() {
  const p = props.draft.postalAddress
  p.country = ''
  p.region = ''
  p.city = ''
  p.district = ''
  p.streetAddress = ''
  p.postcode = ''
}
</script>

<template>
  <div class="location-section">
    <fieldset class="form-fieldset">
      <legend>Geo Location</legend>

      <div v-if="isSystemSetLocation()" class="system-location-row">
        <span class="system-location-badge">
          <i class="pi pi-lock" />
          Set by {{ SYSTEM_SET_LABELS[currentLocationType()] }}
        </span>
        <div class="form-grid mt-sm">
          <FormField label="Latitude" group>
            <div class="form-value readonly">{{ draft.geoLocation?.latitude }}</div>
          </FormField>
          <FormField label="Longitude" group>
            <div class="form-value readonly">{{ draft.geoLocation?.longitude }}</div>
          </FormField>
          <FormField v-if="draft.geoLocation?.accuracy" label="Accuracy (m)" group>
            <div class="form-value readonly">{{ draft.geoLocation?.accuracy }}</div>
          </FormField>
        </div>
      </div>

      <div v-else class="form-grid">
        <FormField label="Location type" class="full-width" v-slot="{ id }">
          <Select
            :input-id="id"
            :model-value="currentLocationType()"
            :options="LOCATION_TYPES"
            option-label="label"
            option-value="value"
            class="form-input"
            @change="onLocationTypeChange($event.value)"
          />
        </FormField>

        <template v-if="draft.geoLocation?.type === 1">
          <div class="form-field">
            <label class="form-label" for="loc-lat">Latitude</label>
            <InputNumber
              id="loc-lat"
              v-model="draft.geoLocation.latitude"
              :min-fraction-digits="0"
              :max-fraction-digits="8"
              class="form-input"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="loc-lng">Longitude</label>
            <InputNumber
              id="loc-lng"
              v-model="draft.geoLocation.longitude"
              :min-fraction-digits="0"
              :max-fraction-digits="8"
              class="form-input"
            />
          </div>
          <div class="form-field">
            <label class="form-label" for="loc-acc">Accuracy (m)</label>
            <InputNumber
              id="loc-acc"
              v-model="draft.geoLocation.accuracy"
              :min="0"
              class="form-input"
            />
          </div>
        </template>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>
        <span>Postal Address</span>
        <Button
          label="Clear all"
          icon="pi pi-times"
          size="small"
          text
          severity="secondary"
          class="clear-btn"
          @click="clearPostalAddress"
        />
      </legend>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label" for="addr-country">Country</label>
          <InputText id="addr-country" v-model="draft.postalAddress.country" class="form-input" />
        </div>
        <div class="form-field">
          <label class="form-label" for="addr-region">Region</label>
          <InputText id="addr-region" v-model="draft.postalAddress.region" class="form-input" />
        </div>
        <div class="form-field">
          <label class="form-label" for="addr-city">City</label>
          <InputText id="addr-city" v-model="draft.postalAddress.city" class="form-input" />
        </div>
        <div class="form-field">
          <label class="form-label" for="addr-district">District</label>
          <InputText id="addr-district" v-model="draft.postalAddress.district" class="form-input" />
        </div>
        <div class="form-field full-width">
          <label class="form-label" for="addr-street">Street address</label>
          <InputText
            id="addr-street"
            v-model="draft.postalAddress.streetAddress"
            class="form-input"
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="addr-postcode">Postcode</label>
          <InputText id="addr-postcode" v-model="draft.postalAddress.postcode" class="form-input" />
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Location Control</legend>
      <Message severity="warn" :closable="false" class="dev-notice">
        Location control settings are in development — changes will not be saved yet.
      </Message>
      <div class="form-grid">
        <div class="form-field full-width">
          <div class="checkbox-row">
            <Checkbox v-model="draft.locationEventEnabled" input-id="loc-event" :binary="true" />
            <label for="loc-event" class="checkbox-label">
              Generate event when location changes
            </label>
          </div>
        </div>
        <FormField label="Control mode" class="full-width" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="draft.locationControlMode"
            :options="CONTROL_MODES"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField
          v-if="draft.locationControlMode !== 0"
          label="Geographical areas"
          group
          class="full-width"
        >
          <GeoAreaPickerButton v-model="draft.locationAreaIds" />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.location-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-fieldset legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.clear-btn {
  font-size: 0.6875rem !important;
  height: 1.25rem !important;
  padding: 0 0.375rem !important;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-grid.mt-sm {
  margin-top: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-value {
  font-size: 0.875rem;
  padding: 0.375rem 0;
}

.form-value.readonly {
  color: var(--p-text-secondary-color);
}

.system-location-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: 1rem;
  padding: 0.2rem 0.625rem;
}

.system-location-row {
  display: flex;
  flex-direction: column;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-label {
  font-size: 0.8125rem;
  cursor: pointer;
}

.dev-notice {
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
}
</style>
