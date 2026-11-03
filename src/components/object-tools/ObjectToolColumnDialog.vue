<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import MibBrowser from '@/components/mibs/MibBrowser.vue'
import MibObjectDetails from '@/components/mibs/MibObjectDetails.vue'
import { useMibNode } from '@/queries/useMibQueries'
import { COLUMN_FORMATS } from '@/utils/objectToolUtils'
import LoadingState from '@/components/common/LoadingState.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** 'snmp-table' | 'agent-list' | 'agent-table' */
  toolType: {
    type: String,
    required: true,
  },
  column: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:visible', 'confirm'])

const isSnmp = computed(() => props.toolType === 'snmp-table')

function buildForm(col) {
  return {
    name: col?.name ?? '',
    oid: col?.oid ?? '',
    format: col?.format ?? 0,
  }
}

const form = ref(buildForm(props.column))
const selectedMibOid = ref(props.column?.oid ?? null)

watch(
  () => props.column,
  (c) => {
    form.value = buildForm(c)
    selectedMibOid.value = c?.oid ?? null
  },
)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.value = buildForm(props.column)
      selectedMibOid.value = props.column?.oid ?? null
    }
  },
)

const { data: mibNode } = useMibNode(selectedMibOid)

function onMibSelect(oid, name) {
  selectedMibOid.value = oid
  form.value.oid = oid
  if (!form.value.name) form.value.name = name
}

function onOidBlur() {
  selectedMibOid.value = form.value.oid || null
}

function confirm() {
  emit('confirm', { ...form.value })
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="column ? 'Edit Column' : 'Add Column'"
    modal
    :breakpoints="isSnmp ? { '1280px': '90vw', '768px': '95vw' } : { '640px': '95vw' }"
    :style="isSnmp ? { width: '1000px' } : { width: '28rem' }"
    :content-style="isSnmp ? { padding: 0 } : undefined"
    @update:visible="emit('update:visible', $event)"
  >
    <template v-if="isSnmp">
      <div class="col-dialog-layout">
        <div class="mib-panel">
          <MibBrowser :selected-oid="selectedMibOid" @select="onMibSelect" />
        </div>

        <div class="detail-panel">
          <div class="col-form">
            <div class="form-field">
              <label for="col-name">Name <span class="required">*</span></label>
              <InputText autofocus id="col-name" v-model="form.name" class="form-input" />
            </div>
            <div class="form-field">
              <label for="col-oid">OID <span class="required">*</span></label>
              <InputText id="col-oid" v-model="form.oid" class="form-input" @blur="onOidBlur" />
            </div>
            <div class="form-field">
              <label for="col-format">Format</label>
              <Select
                id="col-format"
                v-model="form.format"
                :options="COLUMN_FORMATS"
                option-label="label"
                option-value="value"
                class="form-input"
              />
            </div>
          </div>

          <div v-if="mibNode" class="oid-details">
            <div class="details-header">Selected OID</div>
            <MibObjectDetails :node="mibNode" />
          </div>
          <LoadingState v-else-if="selectedMibOid" compact class="oid-details" />
          <div v-else class="oid-details oid-details--empty">
            Select a node from the tree to see details
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="col-form">
        <div class="form-field">
          <label for="col-name">Name <span class="required">*</span></label>
          <InputText id="col-name" v-model="form.name" class="form-input" />
        </div>
        <div class="form-field">
          <label for="col-format">Format</label>
          <Select
            id="col-format"
            v-model="form.format"
            :options="COLUMN_FORMATS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="cancel" />
      <Button
        label="OK"
        severity="primary"
        :disabled="!form.name || (isSnmp && !form.oid)"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.col-dialog-layout {
  display: flex;
  height: 520px;
  overflow: hidden;
}

.mib-panel {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--p-surface-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 1rem;
  gap: 1rem;
}

.col-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.form-input {
  width: 100%;
}

.required {
  color: var(--p-red-400);
}

.oid-details {
  flex-shrink: 0;
}

.oid-details--empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.25rem 0;
}

.details-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--p-surface-border);
}
</style>
