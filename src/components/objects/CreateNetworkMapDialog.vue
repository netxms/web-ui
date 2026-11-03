<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useRouter } from 'vue-router'
import { useObjects } from '@/queries/useObjectQueries'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import FormField from '@/components/common/FormField.vue'

// Matches MapType.* / MapCanvasType.* constants in the legacy client
const MAP_TYPE_OPTIONS = [
  { label: 'Custom', value: 0 },
  { label: 'Layer 2 topology', value: 1 },
  { label: 'IP topology', value: 2 },
  { label: 'Internal communication topology', value: 3 },
  { label: 'OSPF topology', value: 4 },
  { label: 'Hybrid topology', value: 5 },
]
const CANVAS_TYPE_OPTIONS = [
  { label: 'Graph', value: 0 },
  { label: 'Geographical', value: 1 },
]
const SEED_REQUIRED_TYPES = new Set([1, 2, 4, 5])
// Internal communication topology: no seed node
const MAP_TYPE_INTERNAL = 3

// rootId 6 = NetworkMapRoot
const NETWORK_MAP_PERSPECTIVES = [{ id: 'network-maps', label: 'Network Maps', rootId: 6 }]

const SEED_ROOT_LABELS = {
  Network: 'Entire Network',
  ServiceRoot: 'Infrastructure Services',
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Parent object (NetworkMapGroup / NetworkMapRoot) the map is created under */
  parentObject: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const router = useRouter()

const { data: rootObjects } = useObjects()

const seedNodePerspectives = computed(() => {
  const roots = rootObjects.value ?? []
  const found = roots
    .filter((o) => SEED_ROOT_LABELS[o.class])
    .map((o) => ({ id: String(o.id), label: SEED_ROOT_LABELS[o.class], rootId: o.id }))
    .sort((a, b) => (a.label === 'Entire Network' ? -1 : b.label === 'Entire Network' ? 1 : 0))
  return found.length ? found : [{ id: '2', label: 'Infrastructure Services', rootId: 2 }]
})

const name = ref('')
const alias = ref('')
const mapType = ref(0)
const mapCanvasType = ref(0)
const seedObject = ref(null)
const templateMap = ref(null)

const seedRequired = computed(() => SEED_REQUIRED_TYPES.has(mapType.value))
const seedVisible = computed(() => mapType.value !== 0 && mapType.value !== MAP_TYPE_INTERNAL)

const isValid = computed(() => {
  if (name.value.trim().length === 0) return false
  if (seedRequired.value && !seedObject.value) return false
  return true
})

function resetForm() {
  name.value = ''
  alias.value = ''
  mapType.value = 0
  mapCanvasType.value = 0
  seedObject.value = null
  templateMap.value = null
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
})

function isNodeSelectable(node) {
  return node.class === 'Node'
}

function isNetworkMapSelectable(node) {
  return node.class === 'NetworkMap'
}

function isNetworkMapOrContainer(node) {
  return ['NetworkMapRoot', 'NetworkMapGroup', 'NetworkMap'].includes(node.class)
}

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'NetworkMap',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      alias: alias.value.trim() || undefined,
      mapType: mapType.value,
      mapCanvasType: mapCanvasType.value,
      seedObjects: seedObject.value ? [seedObject.value.id] : undefined,
    },
    successMessage: 'Network map created',
    errorMessage: 'Failed to create network map',
  })
  if (!created) return
  onClose()
  if (created.id != null) {
    router.push({ name: 'network-maps', params: { mapId: created.id } })
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    header="Create Network Map"
    width="520px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <div class="form-grid-2">
      <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
        <InputText :id="id" v-model="name" size="small" autofocus />
      </FormField>

      <FormField label="Alias" v-slot="{ id }">
        <InputText :id="id" v-model="alias" size="small" />
      </FormField>

      <FormField label="Map type" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="mapType"
          :options="MAP_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>

      <FormField label="Canvas type" v-slot="{ id }">
        <Select
          :input-id="id"
          v-model="mapCanvasType"
          :options="CANVAS_TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />
      </FormField>

      <ObjectPickerInput
        v-if="seedVisible"
        v-model="seedObject"
        label="Seed node"
        :required="seedRequired"
        dialog-title="Select Seed Node"
        :perspectives="seedNodePerspectives"
        :selectable="isNodeSelectable"
      />

      <ObjectPickerInput
        v-model="templateMap"
        label="Template network map"
        dialog-title="Select Template Network Map"
        :perspectives="NETWORK_MAP_PERSPECTIVES"
        :selectable="isNetworkMapSelectable"
        :display-filter="isNetworkMapOrContainer"
      />
    </div>
  </CreateDialogShell>
</template>
