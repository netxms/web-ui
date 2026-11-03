<script setup>
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import MibBrowser from './MibBrowser.vue'
import MibObjectDetails from './MibObjectDetails.vue'
import FormField from '@/components/common/FormField.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useMibNode } from '@/queries/useMibQueries'
import { normalizeOid, oidError } from '@/utils/snmpOid'
import { notifyNotImplemented } from '@/utils/notImplemented'

// `select` carries the OID and, when the loaded MIBs describe it, its MIB node.
const props = defineProps({
  visible: { type: Boolean, required: true },
  /** OID to start from; anything that does not parse starts the dialog empty. */
  oid: { type: String, default: '' },
  header: { type: String, default: 'Select MIB Object' },
  /** Legacy's "Walk..." button; a not-implemented placeholder (no SNMP walk in the WebAPI). */
  walk: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'select'])

const text = ref('')
const error = ref('')
const selectedMibOid = ref(null)

const { data: mibNode, isFetching: isNodeFetching } = useMibNode(selectedMibOid)

function parsedOrNull(value) {
  return oidError(value) ? null : normalizeOid(value)
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    const start = parsedOrNull(props.oid)
    text.value = start ?? ''
    error.value = ''
    selectedMibOid.value = start
  },
  { immediate: true },
)

function onMibSelect(oid) {
  text.value = oid
  error.value = ''
  selectedMibOid.value = oid
}

function onTextBlur() {
  selectedMibOid.value = parsedOrNull(text.value)
}

function confirm() {
  error.value = oidError(text.value)
  if (error.value) return
  const oid = normalizeOid(text.value)
  emit('select', oid, mibNode.value?.oid === oid ? mibNode.value : null)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :breakpoints="{ '1280px': '90vw', '768px': '95vw' }"
    :style="{ width: '1000px' }"
    :content-style="{ padding: 0 }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <div class="mib-panel">
        <MibBrowser :selected-oid="selectedMibOid" @select="onMibSelect" />
      </div>

      <div class="detail-panel">
        <FormField
          label="Object identifier (OID)"
          required
          :error="error"
          :empty="!text.trim()"
          v-slot="{ id, describedBy }"
        >
          <InputText
            :id="id"
            v-model="text"
            :aria-describedby="describedBy"
            autofocus
            spellcheck="false"
            class="oid-input"
            @input="error = ''"
            @blur="onTextBlur"
            @keydown.enter.prevent="confirm"
          />
        </FormField>

        <div v-if="mibNode && selectedMibOid" class="oid-details">
          <div class="details-header">Selected OID</div>
          <MibObjectDetails :node="mibNode" />
        </div>
        <LoadingState v-else-if="selectedMibOid && isNodeFetching" compact class="oid-details" />
        <div v-else class="oid-details oid-details--empty">
          Select a node from the tree to see details
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        v-if="walk"
        label="Walk..."
        icon="pi pi-sitemap"
        severity="secondary"
        outlined
        class="walk-button"
        @click="notifyNotImplemented('SNMP walk')"
      />
      <Button label="Cancel" severity="secondary" text @click="emit('update:visible', false)" />
      <Button label="OK" icon="pi pi-check" :disabled="!text.trim()" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
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

.oid-input {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.oid-details {
  flex-shrink: 0;
}

.walk-button {
  margin-right: auto;
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
