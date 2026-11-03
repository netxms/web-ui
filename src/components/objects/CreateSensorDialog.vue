<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import InfoCard from '@/components/objects/InfoCard.vue'
import { useRouter } from 'vue-router'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import FormField from '@/components/common/FormField.vue'

// Matches SensorDeviceClass.* constants in the legacy client
const DEVICE_CLASS_OPTIONS = [
  { label: 'Other', value: 0 },
  { label: 'UPS', value: 1 },
  { label: 'Water Meter', value: 2 },
  { label: 'Electricity Meter', value: 3 },
  { label: 'Temperature Sensor', value: 4 },
  { label: 'Humidity Sensor', value: 5 },
  { label: 'Temperature/Humidity Sensor', value: 6 },
  { label: 'CO2 Sensor', value: 7 },
  { label: 'Power Supply', value: 8 },
  { label: 'Current Sensor', value: 9 },
  { label: 'Water Leak Detector', value: 10 },
  { label: 'Smoke Detector', value: 11 },
]

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (Container / Collector / ServiceRoot) the sensor is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const name = ref('')
const alias = ref('')
const deviceClass = ref(0)
const macAddress = ref('')
const deviceAddress = ref('')
const vendor = ref('')
const model = ref('')
const serialNumber = ref('')
const modbusUnitId = ref(null)
const gatewayNode = ref(null)

const MAC_PATTERN = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/

const isValid = computed(() => {
  if (name.value.trim().length === 0) return false
  if (macAddress.value.trim() && !MAC_PATTERN.test(macAddress.value.trim())) return false
  return true
})

function resetForm() {
  name.value = ''
  alias.value = ''
  deviceClass.value = 0
  macAddress.value = ''
  deviceAddress.value = ''
  vendor.value = ''
  model.value = ''
  serialNumber.value = ''
  modbusUnitId.value = null
  gatewayNode.value = null
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

function isNodeSelectable(node) {
  return node.class === 'Node'
}

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'Sensor',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      deviceClass: deviceClass.value,
      macAddress: macAddress.value.trim() || undefined,
      deviceAddress: deviceAddress.value.trim() || undefined,
      vendor: vendor.value.trim() || undefined,
      model: model.value.trim() || undefined,
      serialNumber: serialNumber.value.trim() || undefined,
      modbusUnitId: modbusUnitId.value ?? undefined,
      gatewayNode: gatewayNode.value?.id ?? undefined,
    },
    successMessage: 'Sensor created',
    errorMessage: 'Failed to create sensor',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'infrastructure', params: { objectId: created.id } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Sensor"
    width="560px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <div class="form-row-inline">
      <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
        <InputText :id="id" v-model="name" size="small" autofocus />
      </FormField>
      <FormField label="Alias" v-slot="{ id }">
        <InputText :id="id" v-model="alias" size="small" />
      </FormField>
    </div>

    <FormField label="Device class" v-slot="{ id }">
      <Select
        :input-id="id"
        v-model="deviceClass"
        :options="DEVICE_CLASS_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
      />
    </FormField>

    <ObjectPickerInput
      v-model="gatewayNode"
      label="Gateway node"
      dialog-title="Select Gateway Node"
      :selectable="isNodeSelectable"
    />

    <InfoCard title="Advanced">
      <div class="advanced-grid">
        <FormField label="MAC address" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="macAddress"
            size="small"
            placeholder="e.g. 00:11:22:33:44:55"
          />
        </FormField>
        <FormField label="Device address" v-slot="{ id }">
          <InputText :id="id" v-model="deviceAddress" size="small" />
        </FormField>
        <FormField label="Vendor" v-slot="{ id }">
          <InputText :id="id" v-model="vendor" size="small" />
        </FormField>
        <FormField label="Model" v-slot="{ id }">
          <InputText :id="id" v-model="model" size="small" />
        </FormField>
        <FormField label="Serial number" v-slot="{ id }">
          <InputText :id="id" v-model="serialNumber" size="small" />
        </FormField>
        <FormField label="Modbus unit ID" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="modbusUnitId"
            size="small"
            :min="0"
            :max="255"
            :use-grouping="false"
          />
        </FormField>
      </div>
    </InfoCard>
  </CreateDialogShell>
</template>

<style scoped>
.advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  padding-bottom: 0.875rem;
}
</style>
