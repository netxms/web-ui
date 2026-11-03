<script setup>
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import RadioButton from 'primevue/radiobutton'
import Checkbox from 'primevue/checkbox'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import MapFlagCheckbox from './MapFlagCheckbox.vue'
import { MAP_LINK_COLOR_SOURCES } from '@/utils/networkMapAdapters'
import { buildRoutingOptions, LINK_STYLE_LABELS, MAP_LINK_FLAGS } from '@/utils/networkMapUtils'
import FormField from '@/components/common/FormField.vue'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const COLOR_SOURCES = MAP_LINK_COLOR_SOURCES
const ROUTING_OPTIONS = buildRoutingOptions()
const STYLE_OPTIONS = LINK_STYLE_LABELS.map((label, value) => ({ label, value }))
</script>

<template>
  <div class="network-map-links-section">
    <fieldset class="form-fieldset">
      <legend>Default link style</legend>
      <div class="form-fields">
        <div class="two-col">
          <FormField label="Routing" v-slot="{ id }">
            <Select
              :input-id="id"
              v-model="draft.defaultLinkRouting"
              :options="ROUTING_OPTIONS"
              option-label="label"
              option-value="value"
              class="form-input"
            />
          </FormField>
          <FormField label="Line style" v-slot="{ id }">
            <Select
              :input-id="id"
              v-model="draft.defaultLinkStyle"
              :options="STYLE_OPTIONS"
              option-label="label"
              option-value="value"
              class="form-input"
            />
          </FormField>
        </div>
        <FormField label="Line width (0 = client default)" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="draft.defaultLinkWidth"
            :min="0"
            :max="100"
            show-buttons
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Default link color</legend>
      <div class="form-fields">
        <div class="prop-inline">
          <RadioButton
            v-model="draft.defaultLinkColorSource"
            input-id="dcs-default"
            :value="COLOR_SOURCES.DEFAULT"
          />
          <label for="dcs-default">Default color</label>
        </div>
        <div class="prop-inline">
          <RadioButton
            v-model="draft.defaultLinkColorSource"
            input-id="dcs-object"
            :value="COLOR_SOURCES.OBJECT_STATUS"
          />
          <label for="dcs-object">Based on object status</label>
        </div>
        <div class="prop-inline">
          <RadioButton
            v-model="draft.defaultLinkColorSource"
            input-id="dcs-util"
            :value="COLOR_SOURCES.LINK_UTILIZATION"
          />
          <label for="dcs-util">Based on interface utilization</label>
        </div>
        <div class="prop-inline">
          <RadioButton
            v-model="draft.defaultLinkColorSource"
            input-id="dcs-custom"
            :value="COLOR_SOURCES.CUSTOM"
          />
          <label for="dcs-custom">Custom color</label>
        </div>
        <div class="color-detail">
          <ColorPickerField
            v-model="draft.defaultLinkColor"
            :disabled="draft.defaultLinkColorSource !== COLOR_SOURCES.CUSTOM"
          />
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Link options</legend>
      <div class="form-fields">
        <MapFlagCheckbox
          v-for="flag in MAP_LINK_FLAGS"
          :key="flag.bit"
          :draft="draft"
          :bit="flag.bit"
          :label="flag.label"
        />
        <div class="prop-inline">
          <Checkbox v-model="draft.mergeParallelLinks" input-id="opt-merge-links" :binary="true" />
          <label for="opt-merge-links">Merge parallel links</label>
        </div>
        <FormField label="Number of links to show unmerged between objects" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="draft.linkMergeThreshold"
            :min="1"
            :max="100"
            :disabled="!draft.mergeParallelLinks"
            show-buttons
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.network-map-links-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1.25rem;
}

.color-detail {
  margin-left: 1.75rem;
}
</style>
