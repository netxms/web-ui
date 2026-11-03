<script setup>
/**
 * A labelled form row that owns the label/control association. The slot gets the generated id
 * and the call site binds it: `InputText`/`Textarea` take `id`, while `Select`, `InputNumber`,
 * `Checkbox` and other wrapper-rooted controls take `inputId`.
 *
 * @example
 * <FormField label="Origin" v-slot="{ id }">
 *   <Select :input-id="id" v-model="form.origin" :options="ORIGIN_OPTIONS" />
 * </FormField>
 *
 * @slot default {{ id: string, describedBy: string|undefined }}
 */
import { computed, useId } from 'vue'

defineOptions({ name: 'FormField' })

const props = defineProps({
  /** Omit for a field whose control carries its own accessible name. */
  label: { type: String, default: '' },
  /** Linked to the control via `describedBy`. */
  hint: { type: String, default: '' },
  /** Replaces the hint and is announced assertively. */
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  /** With `required`, draws the red edge on a still-blank control. */
  empty: { type: Boolean, default: false },
  /**
   * For several controls or a composite widget with no single input: `<label for>` would point at
   * nothing, so the field becomes a labelled `role="group"`. Not for silencing the linter on a
   * field that has one control - bind the id.
   */
  group: { type: Boolean, default: false },
  /** Span every column of an enclosing field grid. */
  fullWidth: { type: Boolean, default: false },
})

const id = useId()
const messageId = computed(() => `${id}-message`)
const labelId = computed(() => `${id}-label`)

/** Undefined when there is no message, so the control is not left pointing at nothing. */
const describedBy = computed(() => (props.error || props.hint ? messageId.value : undefined))
</script>

<template>
  <div
    class="form-field"
    :class="{
      'form-field--full': fullWidth,
      'form-field--required-empty': required && empty,
    }"
    :role="group ? 'group' : undefined"
    :aria-labelledby="group && label ? labelId : undefined"
  >
    <!-- `form-label` keeps per-context rules such as `.properties-view .form-label` applying. -->
    <component
      :is="group ? 'span' : 'label'"
      v-if="label"
      :id="group ? labelId : undefined"
      :for="group ? undefined : id"
      class="form-field__label form-label"
    >
      {{ label }}
      <span v-if="required" class="form-field__required" aria-hidden="true">*</span>
    </component>

    <slot :id="id" :described-by="describedBy" />

    <!-- An error supersedes the hint rather than stacking with it. -->
    <small v-if="error" :id="messageId" class="form-field__error" role="alert">{{ error }}</small>
    <small v-else-if="hint" :id="messageId" class="form-field__hint">{{ hint }}</small>
  </div>
</template>
