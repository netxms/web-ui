<script setup>
import { computed, ref } from 'vue'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import FormField from '@/components/common/FormField.vue'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import { useUpdateDataCenterGroup } from '@/queries/useDataCenterQueries'
import { getClassLabel } from '@/utils/objectUtils'
import {
  COOLING_ZONE_TYPE_OPTIONS,
  FEED_TAG_MAX_LENGTH,
  LIMITS,
  NEW_ROOM_GRID,
  POWER_DOMAIN_TYPE_OPTIONS,
  PROVIDER_ID_MAX_LENGTH,
  ROOM_TYPE_OPTIONS,
  createFormDefaults,
  createPayloadFields,
} from '@/utils/dataCenterProperties'

const props = defineProps({
  visible: { type: Boolean, default: false },
  parentObject: { type: Object, default: null },
  /** 'Facility' | 'PowerDomain' | 'CoolingZone' | 'Room' */
  objectClass: { type: String, default: null },
})

// 'created' carries the new object; the host decides where to go.
const emit = defineEmits(['update:visible', 'created'])

const name = ref('')
const alias = ref('')
// Filled at setup too, for a host that mounts the dialog already open.
const form = ref(createFormDefaults(props.objectClass))

const classLabel = computed(() => getClassLabel(props.objectClass))
const isValid = computed(() => name.value.trim().length > 0)

function resetForm() {
  name.value = ''
  alias.value = ''
  form.value = createFormDefaults(props.objectClass)
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})
const toast = useToast()
const { mutateAsync: updateGroup } = useUpdateDataCenterGroup()
const settingUpRoom = ref(false)

/** A failed grid leaves a usable room; the floor plan editor can set the grid later. */
async function applyRoomGrid(room) {
  settingUpRoom.value = true
  try {
    await updateGroup({ id: room.id, group: 'room', payload: NEW_ROOM_GRID })
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: 'Room created without a floor grid',
      detail: err.message,
      life: 6000,
    })
  } finally {
    settingUpRoom.value = false
  }
}

async function onCreate() {
  if (!isValid.value || !props.parentObject || !props.objectClass) return
  const created = await submitCreate({
    payload: {
      class: props.objectClass,
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      ...createPayloadFields(props.objectClass, form.value),
    },
    successMessage: `${classLabel.value} created`,
    errorMessage: `Failed to create ${classLabel.value.toLowerCase()}`,
  })
  if (!created) return
  if (created.class === 'Room') await applyRoomGrid(created)
  onClose()
  emit('created', created)
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    :header="`Create ${classLabel}`"
    width="440px"
    :is-pending="isPending || settingUpRoom"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
      <InputText :id="id" v-model="name" size="small" autofocus @keyup.enter="onCreate" />
    </FormField>

    <FormField label="Alias" v-slot="{ id }">
      <InputText :id="id" v-model="alias" size="small" @keyup.enter="onCreate" />
    </FormField>

    <template v-if="objectClass === 'Facility'">
      <FormField
        label="Computation provider"
        hint="Leave empty to turn the KPI engine off for this facility."
        v-slot="{ id, describedBy }"
      >
        <InputText
          :id="id"
          v-model="form.providerId"
          :maxlength="PROVIDER_ID_MAX_LENGTH"
          :aria-describedby="describedBy"
          size="small"
        />
      </FormField>
      <FormField label="Settlement lag" v-slot="{ id }">
        <InputNumber
          v-model="form.settlementLag"
          :input-id="id"
          :min="LIMITS.settlementLag.min"
          :max="LIMITS.settlementLag.max"
          :allow-empty="false"
          suffix=" days"
          show-buttons
          size="small"
        />
      </FormField>
    </template>

    <template v-else-if="objectClass === 'PowerDomain'">
      <div class="form-row-inline">
        <FormField label="Domain type" v-slot="{ id }">
          <Select
            v-model="form.domainType"
            :input-id="id"
            :options="POWER_DOMAIN_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            size="small"
          />
        </FormField>
        <FormField label="Feed tag" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.feedTag"
            :maxlength="FEED_TAG_MAX_LENGTH"
            placeholder="e.g. A"
            size="small"
          />
        </FormField>
      </div>
      <FormField label="Rated power" hint="0 = not declared" v-slot="{ id, describedBy }">
        <InputNumber
          v-model="form.ratedPower"
          :input-id="id"
          :min="0"
          :max="2147483647"
          :allow-empty="false"
          :aria-describedby="describedBy"
          suffix=" W"
          size="small"
        />
      </FormField>
    </template>

    <template v-else-if="objectClass === 'CoolingZone'">
      <FormField label="Zone type" v-slot="{ id }">
        <Select
          v-model="form.zoneType"
          :input-id="id"
          :options="COOLING_ZONE_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>
      <FormField label="Rated capacity" hint="0 = not declared" v-slot="{ id, describedBy }">
        <InputNumber
          v-model="form.ratedCapacity"
          :input-id="id"
          :min="0"
          :max="2147483647"
          :allow-empty="false"
          :aria-describedby="describedBy"
          suffix=" W"
          size="small"
        />
      </FormField>
    </template>

    <template v-else-if="objectClass === 'Room'">
      <FormField
        label="Room type"
        hint="The room opens on its floor plan, where you set its size and shape."
        v-slot="{ id, describedBy }"
      >
        <Select
          v-model="form.roomType"
          :input-id="id"
          :options="ROOM_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          :aria-describedby="describedBy"
          size="small"
        />
      </FormField>
    </template>
  </CreateDialogShell>
</template>
