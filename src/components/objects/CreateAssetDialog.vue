<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import ProgressSpinner from 'primevue/progressspinner'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import { useAssetManagementSchema } from '@/queries/useAssetManagementSchemaQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (AssetGroup / AssetRoot / Container / Collector / ServiceRoot) */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()
const { data: schema, isLoading: schemaLoading } = useAssetManagementSchema()

const name = ref('')
const alias = ref('')
const propertyValues = ref({})

function resetForm() {
  name.value = ''
  alias.value = ''
  propertyValues.value = {}
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

const sortedAttributes = computed(() => {
  const attrs = schema.value ?? []
  return [...attrs].sort((a, b) => {
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })
})

function getEnumOptions(attr) {
  if (attr.enumMap && Object.keys(attr.enumMap).length) {
    return Object.entries(attr.enumMap)
      .sort(([, a], [, b]) => Number(a) - Number(b))
      .map(([label]) => ({ key: label, label }))
  }
  if (attr.enumValues) {
    return Object.entries(attr.enumValues).map(([key, label]) => ({ key, label }))
  }
  return []
}

function isAttrRequired(attr) {
  return attr.isMandatory && !propertyValues.value[attr.name]
}

function formatDateForApi(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isValid = computed(() => {
  if (name.value.trim().length === 0) return false
  return sortedAttributes.value
    .filter((attr) => attr.isMandatory)
    .every((attr) => !!propertyValues.value[attr.name])
})

function buildAssetProperties() {
  const result = {}
  for (const attr of sortedAttributes.value) {
    const value = propertyValues.value[attr.name]
    if (value != null && value !== '') result[attr.name] = value
  }
  return result
}

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'Asset',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      assetProperties: buildAssetProperties(),
    },
    successMessage: 'Asset created',
    errorMessage: 'Failed to create asset',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'assets', params: { objectId: created.id } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Asset"
    width="640px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <div class="asset-form-scroll form-grid-2">
      <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
        <InputText :id="id" v-model="name" size="small" autofocus />
      </FormField>

      <FormField label="Alias" v-slot="{ id }">
        <InputText :id="id" v-model="alias" size="small" />
      </FormField>

      <div v-if="schemaLoading" class="schema-loading">
        <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
      </div>

      <FormField
        v-for="attr in sortedAttributes"
        v-else
        :key="attr.name"
        :label="attr.displayName"
        :required="attr.isMandatory"
        :empty="isAttrRequired(attr)"
        v-slot="{ id }"
      >
        <InputText
          :id="id"
          v-if="['String', 'IPAddress', 'MacAddress', 'UUID'].includes(attr.dataType)"
          v-model="propertyValues[attr.name]"
          size="small"
        />
        <InputNumber
          v-else-if="attr.dataType === 'Integer'"
          :model-value="
            propertyValues[attr.name] != null ? Number(propertyValues[attr.name]) : null
          "
          @update:model-value="propertyValues[attr.name] = $event != null ? String($event) : ''"
          :use-grouping="false"
          :min-fraction-digits="0"
          :max-fraction-digits="0"
          size="small"
        />
        <InputNumber
          v-else-if="attr.dataType === 'Number'"
          :model-value="
            propertyValues[attr.name] != null ? Number(propertyValues[attr.name]) : null
          "
          @update:model-value="propertyValues[attr.name] = $event != null ? String($event) : ''"
          size="small"
        />
        <ToggleSwitch
          v-else-if="attr.dataType === 'Boolean'"
          :model-value="propertyValues[attr.name] === 'true'"
          @update:model-value="propertyValues[attr.name] = String($event)"
        />
        <Select
          v-else-if="attr.dataType === 'Enum'"
          v-model="propertyValues[attr.name]"
          :options="getEnumOptions(attr)"
          option-value="key"
          option-label="label"
          size="small"
        />
        <DatePicker
          v-else-if="attr.dataType === 'Date'"
          :model-value="propertyValues[attr.name] ? new Date(propertyValues[attr.name]) : null"
          @update:model-value="propertyValues[attr.name] = $event ? formatDateForApi($event) : ''"
          date-format="yy-mm-dd"
          size="small"
        />
        <InputText v-else v-model="propertyValues[attr.name]" size="small" />
      </FormField>
    </div>
  </CreateDialogShell>
</template>

<style scoped>
.asset-form-scroll {
  max-height: 60vh;
  overflow-y: auto;
  align-content: start;
}

.schema-loading {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  padding: 1rem;
}
</style>
