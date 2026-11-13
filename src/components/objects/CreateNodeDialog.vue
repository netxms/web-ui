<script setup>
import { ref, computed, watch } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Password from 'primevue/password'
import Checkbox from 'primevue/checkbox'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import InfoCard from '@/components/objects/InfoCard.vue'
import { useRouter } from 'vue-router'
import { useObjects, useZones } from '@/queries/useObjectQueries'
import { useCreateObjectDialog } from '@/composables/useCreateObjectDialog'
import CreateDialogShell from '@/components/objects/CreateDialogShell.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import { userPrefs } from '@/utils/appStorage'
import FormField from '@/components/common/FormField.vue'

// Node creation flag bits -- see nxcldefs.h NXC_NCF_xxx
const CF_DISABLE_ICMP = 0x0001
const CF_DISABLE_NXCP = 0x0002
const CF_DISABLE_SNMP = 0x0004
const CF_CREATE_UNMANAGED = 0x0008
const CF_ENTER_MAINTENANCE = 0x0010
const CF_AS_ZONE_PROXY = 0x0020
const CF_DISABLE_ETHERNET_IP = 0x0040
const CF_SNMP_SETTINGS_LOCKED = 0x0080
const CF_EXTERNAL_GATEWAY = 0x0100
const CF_DISABLE_SSH = 0x0200
const CF_DISABLE_MODBUS_TCP = 0x0400

const props = defineProps({
  visible: { type: Boolean, default: false },
  parentObject: { type: Object, default: null },
  header: { type: String, default: 'Create Node' },
  /** Values the form opens with instead of blanks: `{ name?, zoneUin? }`. */
  prefill: { type: Object, default: null },
  /** Hand the new node to the caller instead; `created` gets `{ node, unmanaged }`. */
  handOff: { type: Boolean, default: false },
  /** Create unmanaged whatever the checkbox says; the caller decides when polling starts. */
  forceUnmanaged: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'created'])

const router = useRouter()

const name = ref('')
const primaryName = ref('')
const alias = ref('')
const noIpAddress = ref(false)

const agentPort = ref(4700)
const snmpPort = ref(161)
const etherNetIpPort = ref(44818)
const modbusTcpPort = ref(502)
const modbusUnitId = ref(255)
const sshPort = ref(22)

const sshLogin = ref('')
const sshPassword = ref('')

const disableIcmp = ref(false)
const disableSnmp = ref(false)
const disableAgent = ref(false)
const disableSsh = ref(false)
const disableEtherNetIp = ref(false)
const disableModbusTcp = ref(false)
const snmpSettingsLocked = ref(false)
const externalGateway = ref(false)
const unmanaged = ref(false)
const enterMaintenance = ref(false)
const asZoneProxy = ref(false)

const PROXY_FIELDS = [
  'agentProxy',
  'snmpProxy',
  'icmpProxy',
  'etherNetIpProxy',
  'mqttProxy',
  'modbusProxy',
  'sshProxy',
  'webServiceProxy',
]

const proxyLabels = {
  agentProxy: 'NetXMS agents',
  snmpProxy: 'SNMP',
  icmpProxy: 'ICMP',
  etherNetIpProxy: 'EtherNet/IP',
  mqttProxy: 'MQTT',
  modbusProxy: 'Modbus',
  sshProxy: 'SSH',
  webServiceProxy: 'Web services',
}

// Some proxies default to none; the rest fall back to the zone/server default.
const proxyEmptyLabels = {
  agentProxy: 'None',
  snmpProxy: 'None',
  icmpProxy: 'None',
  etherNetIpProxy: 'None',
  modbusProxy: 'None',
  mqttProxy: 'Default',
  sshProxy: 'Default',
  webServiceProxy: 'Default',
}

const PROXY_ROOT_LABELS = {
  Network: 'Entire Network',
  ServiceRoot: 'Infrastructure Services',
}

const { data: rootObjects } = useObjects()

const proxyPerspectives = computed(() => {
  const roots = rootObjects.value ?? []
  const found = roots
    .filter((o) => PROXY_ROOT_LABELS[o.class])
    .map((o) => ({ id: String(o.id), label: PROXY_ROOT_LABELS[o.class], rootId: o.id }))
    .sort((a, b) => (a.label === 'Entire Network' ? -1 : b.label === 'Entire Network' ? 1 : 0))
  return found.length ? found : [{ id: '2', label: 'Infrastructure Services', rootId: 2 }]
})

// Zone picker: only the Entire Network root, showing Zone objects.
const zonePerspectives = computed(() => {
  const networkRoot = (rootObjects.value ?? []).find((o) => o.class === 'Network')
  const rootId = networkRoot?.id ?? 1
  return [{ id: String(rootId), label: 'Entire Network', rootId }]
})

const proxies = ref({
  agentProxy: null,
  snmpProxy: null,
  icmpProxy: null,
  etherNetIpProxy: null,
  mqttProxy: null,
  modbusProxy: null,
  sshProxy: null,
  webServiceProxy: null,
})

const zone = ref(null)

// Picked tree nodes carry no zone UIN, and `zoneUIN` must be the UIN, not the object id.
const zones = useZones({ enabled: () => props.visible })

/** UIN of the picked zone: 0 for none, null while the zone list has not answered yet. */
const zoneUin = computed(() => {
  if (!zone.value) return 0
  if (zone.value.uin != null) return zone.value.uin
  return zones.value.find((z) => z.id === zone.value.id)?.uin ?? null
})

// A prefilled zone is applied once the zone list is in, unless the user picked one first.
let zonePrefillPending = false

function applyZonePrefill() {
  if (!zonePrefillPending) return
  const match = zones.value.find((z) => z.uin === props.prefill?.zoneUin)
  if (match) {
    zone.value = match
    zonePrefillPending = false
  }
}

watch(zones, applyZonePrefill)

function onZonePicked(value) {
  zonePrefillPending = false
  zone.value = value
}

const SHOW_AGAIN_PREF = 'createNodeDialog.showAgain'
const showAgain = ref(userPrefs.get(SHOW_AGAIN_PREF, false) === true)

// Not reset by resetForm(), so expansion survives "show again".
const subAccordionValue = ref([])

watch(showAgain, (val) => {
  userPrefs.set(SHOW_AGAIN_PREF, val)
})

const isValid = computed(
  () =>
    name.value.trim().length > 0 &&
    (noIpAddress.value || primaryName.value.trim().length > 0) &&
    zoneUin.value !== null,
)

function resetForm() {
  name.value = props.prefill?.name ?? ''
  primaryName.value = ''
  alias.value = ''
  noIpAddress.value = false
  agentPort.value = 4700
  snmpPort.value = 161
  etherNetIpPort.value = 44818
  modbusTcpPort.value = 502
  modbusUnitId.value = 1
  sshPort.value = 22
  sshLogin.value = ''
  sshPassword.value = ''
  disableIcmp.value = false
  disableSnmp.value = false
  disableAgent.value = false
  disableSsh.value = false
  disableEtherNetIp.value = false
  disableModbusTcp.value = false
  snmpSettingsLocked.value = false
  externalGateway.value = false
  unmanaged.value = false
  enterMaintenance.value = false
  asZoneProxy.value = false
  proxies.value = {
    agentProxy: null,
    snmpProxy: null,
    icmpProxy: null,
    etherNetIpProxy: null,
    mqttProxy: null,
    modbusProxy: null,
    sshProxy: null,
    webServiceProxy: null,
  }
  zone.value = null
  zonePrefillPending = Boolean(props.prefill?.zoneUin)
  applyZonePrefill()
}

const { isPending, onClose, submitCreate } = useCreateObjectDialog({
  visible: () => props.visible,
  resetForm,
  emit,
  onError: (err, toast) => {
    if (err.status === 403) {
      toast.add({
        severity: 'error',
        summary: 'Cannot create node',
        detail: err.message || 'Access denied or node count license exceeded',
        life: 5000,
      })
    } else if (err.status === 409) {
      toast.add({
        severity: 'error',
        summary: 'IP address conflict',
        detail: err.message || 'This IP address is already in use by another node',
        life: 5000,
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Failed to create node',
        detail: err.message,
        life: 4000,
      })
    }
  },
})

function isNodeSelectable(node) {
  return node.class === 'Node'
}

function isZoneSelectable(node) {
  return node.class === 'Zone'
}

function buildCreationFlags() {
  let flags = 0
  if (disableIcmp.value) flags |= CF_DISABLE_ICMP
  if (disableAgent.value) flags |= CF_DISABLE_NXCP
  if (disableSnmp.value) flags |= CF_DISABLE_SNMP
  if (unmanaged.value || props.forceUnmanaged) flags |= CF_CREATE_UNMANAGED
  if (enterMaintenance.value) flags |= CF_ENTER_MAINTENANCE
  if (asZoneProxy.value) flags |= CF_AS_ZONE_PROXY
  if (disableEtherNetIp.value) flags |= CF_DISABLE_ETHERNET_IP
  if (snmpSettingsLocked.value) flags |= CF_SNMP_SETTINGS_LOCKED
  if (externalGateway.value) flags |= CF_EXTERNAL_GATEWAY
  if (disableSsh.value) flags |= CF_DISABLE_SSH
  if (disableModbusTcp.value) flags |= CF_DISABLE_MODBUS_TCP
  return flags
}

async function onCreate() {
  if (!isValid.value || !props.parentObject) return

  const created = await submitCreate({
    payload: {
      class: 'Node',
      name: name.value.trim(),
      parentId: props.parentObject.id,
      primaryName: noIpAddress.value ? undefined : primaryName.value.trim(),
      alias: alias.value.trim() || undefined,
      agent: { port: agentPort.value, proxy: proxies.value.agentProxy?.id },
      snmp: { port: snmpPort.value, proxy: proxies.value.snmpProxy?.id },
      etherNetIp: { port: etherNetIpPort.value, proxy: proxies.value.etherNetIpProxy?.id },
      modbus: {
        tcpPort: modbusTcpPort.value,
        unitId: modbusUnitId.value,
        proxy: proxies.value.modbusProxy?.id,
      },
      ssh: {
        port: sshPort.value,
        login: sshLogin.value.trim() || undefined,
        password: sshPassword.value || undefined,
        proxy: proxies.value.sshProxy?.id,
      },
      icmp: { proxy: proxies.value.icmpProxy?.id },
      mqttProxy: proxies.value.mqttProxy?.id,
      webServiceProxy: proxies.value.webServiceProxy?.id,
      zoneUIN: zone.value ? zoneUin.value : undefined,
      creationFlags: buildCreationFlags(),
    },
    successMessage: 'Node created',
  })
  if (!created) return

  if (props.handOff) {
    const unmanagedRequested = unmanaged.value
    onClose()
    emit('created', {
      node: { id: created.id, name: name.value.trim() },
      unmanaged: unmanagedRequested,
    })
  } else if (showAgain.value) {
    resetForm()
  } else {
    onClose()
    if (created.id != null) {
      router.push({ name: 'infrastructure', params: { objectId: created.id } })
    }
  }
}
</script>

<template>
  <CreateDialogShell
    :visible="visible"
    :header="header"
    width="800px"
    :is-pending="isPending"
    :is-valid="isValid"
    @update:visible="onClose"
    @create="onCreate"
  >
    <slot name="intro" />

    <div class="form-row-inline">
      <FormField label="Name" required :empty="!name.trim()" v-slot="{ id }">
        <InputText :id="id" v-model="name" size="small" autofocus />
      </FormField>
      <FormField label="Alias" v-slot="{ id }">
        <InputText :id="id" v-model="alias" size="small" />
      </FormField>
    </div>

    <FormField
      label="Primary host name or IP address"
      :required="!noIpAddress"
      :empty="!primaryName.trim()"
      v-slot="{ id }"
    >
      <InputText
        :id="id"
        v-model="primaryName"
        size="small"
        placeholder="e.g. 192.168.1.1 or host.example.com"
        :disabled="noIpAddress"
      />
    </FormField>

    <div class="form-row checkbox-row">
      <Checkbox v-model="noIpAddress" input-id="node-no-ip" :binary="true" />
      <label for="node-no-ip">Node without IP address</label>
    </div>

    <InfoCard title="Advanced">
      <div class="advanced-form">
        <div class="section-label">Ports</div>
        <div class="ports-grid">
          <FormField label="NetXMS agent port" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="agentPort"
              size="small"
              :min="1"
              :max="65535"
              :use-grouping="false"
            />
          </FormField>
          <FormField label="SNMP agent port" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="snmpPort"
              size="small"
              :min="1"
              :max="65535"
              :use-grouping="false"
            />
          </FormField>
          <FormField label="EtherNet/IP port" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="etherNetIpPort"
              size="small"
              :min="1"
              :max="65535"
              :use-grouping="false"
            />
          </FormField>
          <FormField label="Modbus TCP port" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="modbusTcpPort"
              size="small"
              :min="1"
              :max="65535"
              :use-grouping="false"
            />
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
          <FormField label="SSH port" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="sshPort"
              size="small"
              :min="1"
              :max="65535"
              :use-grouping="false"
            />
          </FormField>
        </div>

        <div class="section-label">SSH</div>
        <div class="form-row-inline">
          <FormField label="SSH login" v-slot="{ id }">
            <InputText :id="id" v-model="sshLogin" size="small" />
          </FormField>
          <FormField label="SSH password" v-slot="{ id }">
            <Password
              :id="id"
              v-model="sshPassword"
              size="small"
              :input-props="{ autocomplete: 'new-password' }"
              :feedback="false"
              toggle-mask
            />
          </FormField>
        </div>

        <Accordion v-model:value="subAccordionValue" multiple class="sub-accordion">
          <AccordionPanel value="options">
            <AccordionHeader>Options</AccordionHeader>
            <AccordionContent>
              <div class="options-grid">
                <div class="form-row checkbox-row">
                  <Checkbox v-model="disableIcmp" input-id="node-disable-icmp" :binary="true" />
                  <label for="node-disable-icmp">Disable ICMP ping for all polls</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox
                    v-model="snmpSettingsLocked"
                    input-id="node-snmp-locked"
                    :binary="true"
                  />
                  <label for="node-snmp-locked">Prevent automatic SNMP configuration changes</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="disableSnmp" input-id="node-disable-snmp" :binary="true" />
                  <label for="node-disable-snmp">Disable SNMP for all polls</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox
                    v-model="externalGateway"
                    input-id="node-external-gateway"
                    :binary="true"
                  />
                  <label for="node-external-gateway">Communication through external gateway</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="disableAgent" input-id="node-disable-agent" :binary="true" />
                  <label for="node-disable-agent"
                    >Disable usage of NetXMS agent for all polls</label
                  >
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="unmanaged" input-id="node-unmanaged" :binary="true" />
                  <label for="node-unmanaged">Create as unmanaged object</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="disableSsh" input-id="node-disable-ssh" :binary="true" />
                  <label for="node-disable-ssh">Disable SSH for all polls</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="enterMaintenance" input-id="node-maintenance" :binary="true" />
                  <label for="node-maintenance">Enter maintenance mode immediately</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox
                    v-model="disableEtherNetIp"
                    input-id="node-disable-ethernetip"
                    :binary="true"
                  />
                  <label for="node-disable-ethernetip">Disable EtherNet/IP for all polls</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox v-model="asZoneProxy" input-id="node-zone-proxy" :binary="true" />
                  <label for="node-zone-proxy">Create as zone proxy for selected zone</label>
                </div>
                <div class="form-row checkbox-row">
                  <Checkbox
                    v-model="disableModbusTcp"
                    input-id="node-disable-modbus"
                    :binary="true"
                  />
                  <label for="node-disable-modbus">Disable Modbus TCP for all polls</label>
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
          <AccordionPanel value="proxies">
            <AccordionHeader>Proxies</AccordionHeader>
            <AccordionContent>
              <div class="proxies-grid">
                <ObjectPickerInput
                  v-for="field in PROXY_FIELDS"
                  :key="field"
                  v-model="proxies[field]"
                  :label="proxyLabels[field]"
                  :empty-label="proxyEmptyLabels[field]"
                  dialog-title="Select Proxy Node"
                  :perspectives="proxyPerspectives"
                  :selectable="isNodeSelectable"
                />
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>

        <div class="section-label">Zone</div>
        <ObjectPickerInput
          :model-value="zone"
          empty-label="Default"
          dialog-title="Select Zone"
          :perspectives="zonePerspectives"
          :selectable="isZoneSelectable"
          :display-filter="isZoneSelectable"
          @update:model-value="onZonePicked"
        />
      </div>
    </InfoCard>

    <template v-if="!handOff" #footer-extra>
      <div class="form-row checkbox-row footer-show-again">
        <Checkbox v-model="showAgain" input-id="node-show-again" :binary="true" />
        <label for="node-show-again">Show this dialog again to create another node</label>
      </div>
    </template>
  </CreateDialogShell>
</template>

<style scoped>
:deep(.p-password input) {
  width: 100%;
}

.advanced-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.875rem;
}

.section-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
  margin-top: 0.375rem;
  padding-top: 0.625rem;
  border-top: 1px solid var(--p-surface-border);
}

.section-label:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.ports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem 1.25rem;
}

.proxies-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

/* The panel owns the border so header and content share one card */
.sub-accordion :deep(.p-accordionpanel) {
  border-radius: var(--p-border-radius-sm);
  overflow: hidden;
}

.sub-accordion :deep([data-p-active='false']) {
  border-bottom: none;
}

.sub-accordion :deep(.p-accordionheader) {
  background: var(--p-surface-50);
  border: none;
  border-radius: 0;
  padding: 0.4rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-color);
}

.sub-accordion :deep(.p-accordionheader:hover) {
  background: var(--p-content-hover-background);
  cursor: pointer;
}

.sub-accordion :deep([data-p-active='true'] .p-accordionheader) {
  border-bottom: 1px solid var(--p-surface-border);
}

.sub-accordion :deep(.p-accordionpanel + .p-accordionpanel) {
  margin-top: 0.375rem;
}

.sub-accordion :deep(.p-accordioncontent-content) {
  padding: 0.625rem 0 0.875rem;
}

.footer-show-again {
  flex-shrink: 0;
  padding-left: 0.5rem;
}

.footer-show-again label {
  font-size: 0.8125rem;
}
</style>
