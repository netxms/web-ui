<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import FormField from '@/components/common/FormField.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import CommunicationPanel from './CommunicationPanel.vue'
import { useObjectChildren, useObjectsByIds } from '@/queries/useObjectQueries'
import { useSshKeys } from '@/queries/useSshKeyQueries'
import { ICMP_STAT_MODE_OPTIONS, isValidUnicastAddress } from '@/utils/nodeCommunication'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  /** Properties draft of a Node. */
  draft: { type: Object, required: true },
  proxyPerspectives: { type: Array, required: true },
  /** False on a server that neither reports nor saves these settings; the slots still render. */
  supported: { type: Boolean, default: true },
})

const isNode = (o) => o.class === 'Node'

const { data: sshKeys } = useSshKeys()
const sshKeyOptions = computed(() => {
  const keys = (sshKeys.value ?? []).map((k) => ({ id: k.id, name: k.name }))
  const current = props.draft.ssh.keyId
  if (current && !keys.some((k) => k.id === current)) {
    keys.push({ id: current, name: `Key #${current}` })
  }
  return [{ id: 0, name: 'None' }, ...keys]
})

// The address list needs every interface of the node, so it is read when the list opens.
const addressListOpened = ref(false)
const { data: interfaces, isFetching: interfacesLoading } = useObjectChildren(
  computed(() => (addressListOpened.value ? props.draft.id : null)),
  ['Interface'],
)

function isUsableAddress(address) {
  return (
    address !== '0.0.0.0' && address !== '::' && address !== '::1' && !address.startsWith('127.')
  )
}

const etherNetIpOptions = computed(() => {
  const addresses = new Set()
  for (const iface of interfaces.value ?? []) {
    for (const entry of iface.ipAddressList ?? []) {
      const address = String(entry).split('/')[0]
      if (isUsableAddress(address)) addresses.add(address)
    }
  }
  const current = props.draft.etherNetIp.address
  if (current) addresses.add(current)
  return [
    { label: 'Use primary address', value: null },
    ...[...addresses].map((a) => ({ label: a, value: a })),
  ]
})

const newIcmpTarget = ref('')
const icmpTargetError = ref('')

function addIcmpTarget() {
  const address = newIcmpTarget.value.trim()
  if (!address) return
  if (!isValidUnicastAddress(address)) {
    icmpTargetError.value = 'Enter a unicast IPv4 or IPv6 address.'
    return
  }
  icmpTargetError.value = ''
  newIcmpTarget.value = ''
  if (!props.draft.icmp.targets.includes(address)) {
    props.draft.icmp.targets = [...props.draft.icmp.targets, address]
  }
}

function removeIcmpTarget(address) {
  props.draft.icmp.targets = props.draft.icmp.targets.filter((a) => a !== address)
}

const icmpModeLabel = computed(
  () =>
    ICMP_STAT_MODE_OPTIONS.find((o) => o.value === props.draft.icmp.statCollectionMode)?.label ??
    props.draft.icmp.statCollectionMode,
)

const icmpSummary = computed(() => {
  const count = props.draft.icmp.targets.length
  return [
    `statistics ${icmpModeLabel.value.toLowerCase()}`,
    count ? `${count} additional target${count === 1 ? '' : 's'}` : '',
  ]
})

const proxyIds = computed(() =>
  [props.draft.mqttProxy, props.draft.webServiceProxy].filter((id) => id > 0),
)
const { objectsById: proxyObjects } = useObjectsByIds(proxyIds)

function proxySummary(id) {
  if (!id) return 'default proxy'
  return `proxy ${proxyObjects.value.get(id)?.name ?? `#${id}`}`
}
</script>

<template>
  <slot name="agent" />

  <template v-if="supported">
    <CommunicationPanel
      title="EtherNet/IP"
      :summary="[
        draft.etherNetIp.address || 'primary address',
        `TCP port ${draft.etherNetIp.port}`,
      ]"
    >
      <div class="form-grid">
        <FormField label="IP address" v-slot="{ id }">
          <Select
            v-model="draft.etherNetIp.address"
            :input-id="id"
            :options="etherNetIpOptions"
            option-label="label"
            option-value="value"
            :loading="interfacesLoading"
            class="form-input"
            @show="addressListOpened = true"
          />
        </FormField>
        <FormField label="TCP port" v-slot="{ id }">
          <InputNumber
            v-model="draft.etherNetIp.port"
            :input-id="id"
            :min="1"
            :max="65535"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
      </div>
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.etherNetIp.proxy"
          empty-label="None"
          dialog-title="Select EtherNet/IP Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="ICMP" :summary="icmpSummary">
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.icmp.proxy"
          empty-label="None"
          dialog-title="Select ICMP Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
      <FormField label="ICMP response statistic collection" v-slot="{ id }">
        <SelectButton
          v-model="draft.icmp.statCollectionMode"
          :input-id="id"
          :options="ICMP_STAT_MODE_OPTIONS"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
        />
      </FormField>
      <FormField
        label="Additional targets for ICMP response statistic collection"
        group
        :error="icmpTargetError"
      >
        <ul v-if="draft.icmp.targets.length" class="target-list">
          <li v-for="address in draft.icmp.targets" :key="address" class="target-row">
            <span class="target-address">{{ address }}</span>
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :aria-label="`Remove ${address}`"
              @click="removeIcmpTarget(address)"
            />
          </li>
        </ul>
        <p v-else class="form-hint">No additional targets.</p>
        <div class="target-add">
          <InputText
            v-model="newIcmpTarget"
            class="form-input"
            placeholder="IP address"
            aria-label="New target IP address"
            :invalid="!!icmpTargetError"
            @keydown.enter.prevent="addIcmpTarget"
            @input="icmpTargetError = ''"
          />
          <Button
            icon="pi pi-plus"
            label="Add"
            size="small"
            outlined
            :disabled="!newIcmpTarget.trim()"
            @click="addIcmpTarget"
          />
        </div>
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel
      title="Modbus"
      :summary="[`TCP port ${draft.modbus.tcpPort}`, `unit ID ${draft.modbus.unitId}`]"
    >
      <div class="form-grid">
        <FormField label="TCP port" v-slot="{ id }">
          <InputNumber
            v-model="draft.modbus.tcpPort"
            :input-id="id"
            :min="1"
            :max="65535"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
        <FormField label="Unit ID" v-slot="{ id }">
          <InputNumber
            v-model="draft.modbus.unitId"
            :input-id="id"
            :min="0"
            :max="255"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
      </div>
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.modbus.proxy"
          empty-label="None"
          dialog-title="Select Modbus Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="MQTT" :summary="proxySummary(draft.mqttProxy)">
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.mqttProxy"
          empty-label="Default"
          dialog-title="Select MQTT Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="NETCONF" :summary="`TCP port ${draft.netconf.port}`">
      <p class="form-hint">Logs in with the SSH login, password and key.</p>
      <div class="port-row">
        <FormField label="Port" v-slot="{ id }">
          <InputNumber
            v-model="draft.netconf.port"
            :input-id="id"
            :min="1"
            :max="65535"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
        <FormField label="Proxy" group>
          <ObjectPickerField
            v-model="draft.netconf.proxy"
            empty-label="Default"
            dialog-title="Select NETCONF Proxy Node"
            :perspectives="proxyPerspectives"
            :selectable="isNode"
          />
        </FormField>
      </div>
    </CommunicationPanel>
  </template>

  <slot name="snmp" />

  <template v-if="supported">
    <CommunicationPanel
      title="SSH"
      :summary="[`TCP port ${draft.ssh.port}`, draft.ssh.login && `login ${draft.ssh.login}`]"
    >
      <div class="form-grid">
        <FormField label="Login" v-slot="{ id }">
          <InputText :id="id" v-model="draft.ssh.login" class="form-input" autocomplete="off" />
        </FormField>
        <FormField label="Password" v-slot="{ id }">
          <Password
            v-model="draft.ssh.password"
            :input-id="id"
            class="secret-input"
            :input-props="{ autocomplete: 'new-password' }"
            :feedback="false"
            toggle-mask
          />
        </FormField>
        <FormField label="Port" v-slot="{ id }">
          <InputNumber
            v-model="draft.ssh.port"
            :input-id="id"
            :min="1"
            :max="65535"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
        <FormField label="SSH key" v-slot="{ id }">
          <Select
            v-model="draft.ssh.keyId"
            :input-id="id"
            :options="sshKeyOptions"
            option-label="name"
            option-value="id"
            class="form-input"
          />
        </FormField>
      </div>
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.ssh.proxy"
          empty-label="Default"
          dialog-title="Select SSH Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="Syslog" :summary="draft.syslogCodepage || 'server default codepage'">
      <FormField label="Codepage" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="draft.syslogCodepage"
          class="form-input"
          placeholder="(server default)"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="VNC" :summary="`TCP port ${draft.vnc.port}`">
      <div class="form-grid">
        <FormField label="Port" v-slot="{ id }">
          <InputNumber
            v-model="draft.vnc.port"
            :input-id="id"
            :min="1"
            :max="65535"
            :use-grouping="false"
            :allow-empty="false"
            class="number-input"
          />
        </FormField>
        <FormField label="Password" v-slot="{ id }">
          <Password
            v-model="draft.vnc.password"
            :input-id="id"
            class="secret-input"
            :input-props="{ autocomplete: 'new-password' }"
            :feedback="false"
            toggle-mask
          />
        </FormField>
      </div>
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.vnc.proxy"
          empty-label="Default"
          dialog-title="Select VNC Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>

    <CommunicationPanel title="Web Services" :summary="proxySummary(draft.webServiceProxy)">
      <FormField label="Proxy" group>
        <ObjectPickerField
          v-model="draft.webServiceProxy"
          empty-label="Default"
          dialog-title="Select Web Service Proxy Node"
          :perspectives="proxyPerspectives"
          :selectable="isNode"
        />
      </FormField>
    </CommunicationPanel>
  </template>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.port-row {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: 0.75rem;
}

.number-input,
:deep(.number-input .p-inputnumber-input) {
  width: 100%;
}

.secret-input,
:deep(.secret-input .p-password-input) {
  width: 100%;
}

.target-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  max-height: 12rem;
  overflow-y: auto;
}

.target-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.125rem 0.25rem 0.125rem 0.5rem;
  font-size: 0.8125rem;
}

.target-row + .target-row {
  border-top: 1px solid var(--p-surface-border);
}

.target-address {
  font-family: var(--font-mono, monospace);
  overflow-wrap: anywhere;
}

.target-add {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.target-add .form-input {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .form-grid,
  .port-row {
    grid-template-columns: 1fr;
  }
}
</style>
