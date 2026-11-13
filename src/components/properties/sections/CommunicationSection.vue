<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import SnmpAgentDialog from '@/components/properties/SnmpAgentDialog.vue'
import CommunicationPanel from '@/components/properties/communication/CommunicationPanel.vue'
import NodeProtocolPanels from '@/components/properties/communication/NodeProtocolPanels.vue'
import { useObjects } from '@/queries/useObjectQueries'
import FormField from '@/components/common/FormField.vue'
import { NODE_WITHOUT_IP, isValidHostName } from '@/utils/nodeCommunication'
import {
  SNMP_AUTH_METHOD_OPTIONS,
  SNMP_PRIV_METHOD_OPTIONS,
  SNMP_VERSION_OPTIONS,
} from '@/utils/snmpOptions'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const COMPRESSION_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const CACHE_MODE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

const CERT_MAPPING_METHODS = [
  { value: 'subject', label: 'Subject' },
  { value: 'publicKey', label: 'Public key' },
  { value: 'commonName', label: 'Common name' },
  { value: 'templateId', label: 'Template ID' },
]

const PROXY_PERSPECTIVE_MAP = {
  ServiceRoot: 'Infrastructure',
  Network: 'Network',
}

const { data: rootObjects } = useObjects()
const proxyPerspectives = computed(() => {
  const roots = rootObjects.value ?? []
  const found = roots
    .filter((o) => PROXY_PERSPECTIVE_MAP[o.class])
    .map((o) => ({ id: String(o.id), label: PROXY_PERSPECTIVE_MAP[o.class], rootId: o.id }))
  return found.length ? found : [{ id: '2', label: 'Infrastructure', rootId: 2 }]
})

const isNode = computed(() => props.draft.class === 'Node')

// Came with the protocol groups; a server without it ignores them on PATCH and still answers 200.
const settingsSupported = computed(() => 'webServiceProxy' in props.object)
const isNodeSelectable = (o) => o.class === 'Node'

// Legacy keeps the typed name when "Node without IP address" is cleared; this restores it.
const hostNameBeforeNoIp = ref(
  props.draft.primaryName === NODE_WITHOUT_IP ? '' : (props.draft.primaryName ?? ''),
)
const withoutIp = computed({
  get: () => props.draft.primaryName === NODE_WITHOUT_IP,
  set: (on) => {
    if (on) {
      hostNameBeforeNoIp.value = props.draft.primaryName
      props.draft.primaryName = NODE_WITHOUT_IP
    } else {
      props.draft.primaryName = hostNameBeforeNoIp.value
    }
  },
})

const primaryNameError = computed(() => {
  const name = props.draft.primaryName ?? ''
  if (name === props.object.primaryName) return ''
  if (!name.trim()) return 'Enter a host name or IP address.'
  return isValidHostName(name) ? '' : 'Not a valid host name or IP address.'
})

function onSecretInput() {
  props.draft.agent.secretTouched = true
}

// The WebAPI replaces the whole `agents` array on PATCH, so the draft holds the full list
// and every mutation assigns a new array (keeps the dirty diff in PropertiesView stable).
const snmpAgents = computed(() => props.draft.snmp?.agents ?? [])

const agentDialogVisible = ref(false)
const editingAgentIndex = ref(-1)

const editingAgent = computed(() =>
  editingAgentIndex.value >= 0 ? (snmpAgents.value[editingAgentIndex.value] ?? null) : null,
)

const otherAgentNames = computed(() =>
  snmpAgents.value.filter((_, i) => i !== editingAgentIndex.value).map((a) => a.name),
)

function addSnmpAgent() {
  editingAgentIndex.value = -1
  agentDialogVisible.value = true
}

function editSnmpAgent(index) {
  editingAgentIndex.value = index
  agentDialogVisible.value = true
}

function deleteSnmpAgent(index) {
  props.draft.snmp.agents = snmpAgents.value.filter((_, i) => i !== index)
}

function onSnmpAgentConfirm(agent) {
  const next = [...snmpAgents.value]
  if (editingAgentIndex.value >= 0) next[editingAgentIndex.value] = agent
  else next.push(agent)
  props.draft.snmp.agents = next
}

function onToggleSnmpTrap(enabled) {
  props.draft.snmp.trap = enabled
    ? {
        version: '2c',
        authName: '',
        authMethod: 'NONE',
        authPassword: '',
        authPasswordTouched: false,
        privMethod: 'NONE',
        privPassword: '',
        privPasswordTouched: false,
      }
    : null
}
</script>

<template>
  <div class="communication-section">
    <template v-if="isNode">
      <fieldset class="form-fieldset">
        <legend>General</legend>
        <div class="form-fields">
          <FormField
            label="Primary host name"
            :error="primaryNameError"
            v-slot="{ id, describedBy }"
          >
            <InputText
              :id="id"
              v-model="draft.primaryName"
              class="form-input"
              :disabled="withoutIp"
              :invalid="!!primaryNameError"
              :aria-describedby="describedBy"
            />
          </FormField>
          <div class="flags-grid">
            <label class="flag-row">
              <Checkbox v-model="withoutIp" :binary="true" />
              <span class="flag-label">Node without IP address</span>
            </label>
            <label class="flag-row">
              <Checkbox
                v-model="draft.externalGateway"
                :binary="true"
                :disabled="!settingsSupported"
              />
              <span class="flag-label">Communication through external gateway</span>
            </label>
          </div>
          <p v-if="!settingsSupported" class="form-hint">
            This server does not report the external gateway flag or the SSH, NETCONF, VNC, ICMP,
            EtherNet/IP, Modbus, MQTT, syslog and web service settings yet.
          </p>
        </div>
      </fieldset>

      <NodeProtocolPanels
        :draft="draft"
        :proxy-perspectives="proxyPerspectives"
        :supported="settingsSupported"
      >
        <template #agent>
          <CommunicationPanel
            v-if="draft.agent"
            title="Agent"
            :summary="`TCP port ${draft.agent.port}`"
          >
            <div class="agent-top-row">
              <div class="form-field">
                <label class="form-label" for="comm-agent-port">TCP port</label>
                <InputNumber
                  id="comm-agent-port"
                  v-model="draft.agent.port"
                  :min="1"
                  :max="65535"
                  :use-grouping="false"
                  class="agent-port-input"
                />
              </div>
              <FormField label="Proxy" group>
                <ObjectPickerField
                  v-model="draft.agent.proxy"
                  empty-label="(no proxy)"
                  dialog-title="Select Agent Proxy Node"
                  :perspectives="proxyPerspectives"
                  :selectable="(o) => o.class === 'Node'"
                />
              </FormField>
            </div>

            <div class="flags-grid">
              <label class="flag-row">
                <Checkbox v-model="draft.agent.forceEncryption" :binary="true" />
                <span class="flag-label">Force encryption</span>
              </label>
              <label class="flag-row">
                <Checkbox v-model="draft.agent.tunnelOnly" :binary="true" />
                <span class="flag-label">Agent connections through tunnel only</span>
              </label>
            </div>

            <div class="form-field">
              <label class="form-label" for="comm-agent-secret">Shared secret</label>
              <Password
                id="comm-agent-secret"
                v-model="draft.agent.sharedSecret"
                class="form-input secret-input"
                input-class="form-input"
                :input-props="{ autocomplete: 'new-password' }"
                :feedback="false"
                toggle-mask
                @input="onSecretInput"
              />
            </div>

            <div class="form-subsection">
              <h4 class="subsection-title">Protocol settings</h4>
              <div class="subsection-row">
                <FormField label="Protocol compression mode" class="triple-field" v-slot="{ id }">
                  <SelectButton
                    :input-id="id"
                    v-model="draft.agent.compressionMode"
                    :options="COMPRESSION_OPTIONS"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                    size="small"
                  />
                </FormField>

                <FormField label="Agent cache mode" class="triple-field" v-slot="{ id }">
                  <SelectButton
                    :input-id="id"
                    v-model="draft.agent.cacheMode"
                    :options="CACHE_MODE_OPTIONS"
                    option-label="label"
                    option-value="value"
                    :allow-empty="false"
                    size="small"
                  />
                </FormField>
              </div>
            </div>

            <div class="form-subsection">
              <h4 class="subsection-title">Certificate mapping</h4>
              <div class="form-grid">
                <FormField label="Method" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="draft.agent.certificateMappingMethod"
                    :options="CERT_MAPPING_METHODS"
                    option-label="label"
                    option-value="value"
                    class="form-input"
                  />
                </FormField>
                <FormField label="Mapping data" v-slot="{ id }">
                  <InputText
                    :id="id"
                    v-model="draft.agent.certificateMappingData"
                    class="form-input"
                  />
                </FormField>
              </div>
            </div>
          </CommunicationPanel>
          <fieldset v-else class="form-fieldset">
            <legend>Agent</legend>
            <p class="form-hint">Loading agent configuration...</p>
          </fieldset>
        </template>

        <template #snmp>
          <CommunicationPanel
            v-if="draft.snmp"
            title="SNMP"
            :summary="[`v${draft.snmp.version}`, `UDP port ${draft.snmp.port}`]"
          >
            <div class="snmp-top-row">
              <FormField label="Version" v-slot="{ id }">
                <Select
                  :input-id="id"
                  v-model="draft.snmp.version"
                  :options="SNMP_VERSION_OPTIONS"
                  option-label="label"
                  option-value="value"
                  class="form-input"
                />
              </FormField>
              <div class="form-field">
                <label class="form-label" for="comm-snmp-port">UDP port</label>
                <InputNumber
                  id="comm-snmp-port"
                  v-model="draft.snmp.port"
                  :min="1"
                  :max="65535"
                  :use-grouping="false"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="comm-snmp-auth-name">
                  {{ draft.snmp.version === '3' ? 'User name' : 'Community string' }}
                </label>
                <InputText
                  v-if="draft.snmp.version !== '3'"
                  id="comm-snmp-auth-name"
                  v-model="draft.snmp.authName"
                  class="form-input"
                />
                <Password
                  v-else
                  id="comm-snmp-auth-name"
                  v-model="draft.snmp.authName"
                  class="form-input secret-input"
                  input-class="form-input"
                  :input-props="{ autocomplete: 'new-password' }"
                  :feedback="false"
                  toggle-mask
                />
              </div>
            </div>

            <div v-if="draft.snmp.version === '3'" class="form-grid">
              <FormField label="Authentication" v-slot="{ id }">
                <Select
                  :input-id="id"
                  v-model="draft.snmp.authMethod"
                  :options="SNMP_AUTH_METHOD_OPTIONS"
                  option-label="label"
                  option-value="value"
                  class="form-input"
                />
              </FormField>
              <div class="form-field">
                <label class="form-label" for="comm-snmp-auth-password">Auth password</label>
                <Password
                  id="comm-snmp-auth-password"
                  v-model="draft.snmp.authPassword"
                  class="form-input secret-input"
                  input-class="form-input"
                  :input-props="{ autocomplete: 'new-password' }"
                  :feedback="false"
                  toggle-mask
                  @input="draft.snmp.authPasswordTouched = true"
                />
              </div>
            </div>

            <div v-if="draft.snmp.version === '3'" class="form-grid">
              <FormField label="Encryption" v-slot="{ id }">
                <Select
                  :input-id="id"
                  v-model="draft.snmp.privMethod"
                  :options="SNMP_PRIV_METHOD_OPTIONS"
                  option-label="label"
                  option-value="value"
                  class="form-input"
                />
              </FormField>
              <div class="form-field">
                <label class="form-label" for="comm-snmp-priv-password">Encryption password</label>
                <Password
                  id="comm-snmp-priv-password"
                  v-model="draft.snmp.privPassword"
                  class="form-input secret-input"
                  input-class="form-input"
                  :input-props="{ autocomplete: 'new-password' }"
                  :feedback="false"
                  toggle-mask
                  @input="draft.snmp.privPasswordTouched = true"
                />
              </div>
            </div>

            <div class="form-subsection">
              <div class="form-grid">
                <FormField label="Proxy" group>
                  <ObjectPickerField
                    v-model="draft.snmp.proxy"
                    empty-label="(no proxy)"
                    dialog-title="Select SNMP Proxy Node"
                    :perspectives="proxyPerspectives"
                    :selectable="(o) => o.class === 'Node'"
                  />
                </FormField>
                <div class="form-field">
                  <label class="form-label" for="comm-snmp-codepage">Codepage</label>
                  <InputText
                    id="comm-snmp-codepage"
                    v-model="draft.snmp.codepage"
                    class="form-input"
                    placeholder="(server default)"
                  />
                </div>
              </div>

              <div class="flags-grid">
                <label class="flag-row">
                  <Checkbox v-model="draft.snmp.settingsLocked" :binary="true" />
                  <span class="flag-label">Prevent automatic SNMP configuration changes</span>
                </label>
                <label class="flag-row">
                  <Checkbox
                    :model-value="!!draft.snmp.trap"
                    :binary="true"
                    @update:model-value="onToggleSnmpTrap"
                  />
                  <span class="flag-label">Use separate credentials for SNMP trap reception</span>
                </label>
              </div>
            </div>

            <div v-if="draft.snmp.trap" class="form-subsection">
              <h4 class="subsection-title">SNMP trap reception credentials</h4>

              <div class="snmp-trap-row">
                <FormField label="Trap version" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="draft.snmp.trap.version"
                    :options="SNMP_VERSION_OPTIONS"
                    option-label="label"
                    option-value="value"
                    class="form-input"
                  />
                </FormField>
                <div class="form-field">
                  <label class="form-label" for="comm-snmp-trap-auth-name">
                    {{
                      draft.snmp.trap.version === '3' ? 'Trap user name' : 'Trap community string'
                    }}
                  </label>
                  <InputText
                    v-if="draft.snmp.trap.version !== '3'"
                    id="comm-snmp-trap-auth-name"
                    v-model="draft.snmp.trap.authName"
                    class="form-input"
                  />
                  <Password
                    v-else
                    id="comm-snmp-trap-auth-name"
                    v-model="draft.snmp.trap.authName"
                    class="form-input secret-input"
                    input-class="form-input"
                    :input-props="{ autocomplete: 'new-password' }"
                    :feedback="false"
                    toggle-mask
                  />
                </div>
              </div>

              <div v-if="draft.snmp.trap.version === '3'" class="form-grid">
                <FormField label="Trap authentication" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="draft.snmp.trap.authMethod"
                    :options="SNMP_AUTH_METHOD_OPTIONS"
                    option-label="label"
                    option-value="value"
                    class="form-input"
                  />
                </FormField>
                <div class="form-field">
                  <label class="form-label" for="comm-snmp-trap-auth-password"
                    >Trap auth password</label
                  >
                  <Password
                    id="comm-snmp-trap-auth-password"
                    v-model="draft.snmp.trap.authPassword"
                    class="form-input secret-input"
                    input-class="form-input"
                    :input-props="{ autocomplete: 'new-password' }"
                    :feedback="false"
                    toggle-mask
                    @input="draft.snmp.trap.authPasswordTouched = true"
                  />
                </div>
              </div>

              <div v-if="draft.snmp.trap.version === '3'" class="form-grid">
                <FormField label="Trap encryption" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="draft.snmp.trap.privMethod"
                    :options="SNMP_PRIV_METHOD_OPTIONS"
                    option-label="label"
                    option-value="value"
                    class="form-input"
                  />
                </FormField>
                <div class="form-field">
                  <label class="form-label" for="comm-snmp-trap-priv-password"
                    >Trap encryption password</label
                  >
                  <Password
                    id="comm-snmp-trap-priv-password"
                    v-model="draft.snmp.trap.privPassword"
                    class="form-input secret-input"
                    input-class="form-input"
                    :input-props="{ autocomplete: 'new-password' }"
                    :feedback="false"
                    toggle-mask
                    @input="draft.snmp.trap.privPasswordTouched = true"
                  />
                </div>
              </div>
            </div>
          </CommunicationPanel>
          <fieldset v-else class="form-fieldset">
            <legend>SNMP</legend>
            <p class="form-hint">Loading SNMP configuration...</p>
          </fieldset>

          <CommunicationPanel
            v-if="draft.snmp"
            title="SNMP Agents"
            :summary="`${snmpAgents.length} additional agent${snmpAgents.length === 1 ? '' : 's'}`"
          >
            <p class="form-hint">
              Alternative SNMP endpoints on this node. Data collection items can target one of them
              by name instead of the node's primary SNMP agent.
            </p>

            <div class="agent-table-card">
              <table class="agent-table">
                <thead>
                  <tr>
                    <th class="col-name">Name</th>
                    <th class="col-address">Address</th>
                    <th class="col-port">Port</th>
                    <th class="col-version">Version</th>
                    <th class="col-auth">User/community</th>
                    <th class="col-context">Context</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(agent, index) in snmpAgents"
                    :key="index"
                    @dblclick="editSnmpAgent(index)"
                  >
                    <td class="cell-wrap">{{ agent.name }}</td>
                    <td class="cell-wrap">
                      <span v-if="agent.address">{{ agent.address }}</span>
                      <span v-else class="cell-muted">(node primary)</span>
                    </td>
                    <td>{{ agent.port }}</td>
                    <td>v{{ agent.version }}</td>
                    <td class="cell-wrap">
                      <span v-if="agent.authName">{{ agent.authName }}</span>
                      <span v-else class="cell-muted">&mdash;</span>
                    </td>
                    <td class="cell-wrap">
                      <span v-if="agent.contextName">{{ agent.contextName }}</span>
                      <span v-else class="cell-muted">&mdash;</span>
                    </td>
                    <td class="col-actions">
                      <Button
                        icon="pi pi-pencil"
                        size="small"
                        text
                        severity="secondary"
                        aria-label="Edit agent"
                        @click="editSnmpAgent(index)"
                      />
                      <Button
                        icon="pi pi-trash"
                        size="small"
                        text
                        severity="danger"
                        aria-label="Delete agent"
                        @click="deleteSnmpAgent(index)"
                      />
                    </td>
                  </tr>
                  <tr v-if="snmpAgents.length === 0">
                    <td colspan="7" class="empty-state">No additional SNMP agents configured</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="agent-actions">
              <Button
                icon="pi pi-plus"
                label="Add SNMP agent"
                size="small"
                outlined
                @click="addSnmpAgent"
              />
            </div>
          </CommunicationPanel>
        </template>
      </NodeProtocolPanels>

      <SnmpAgentDialog
        v-model:visible="agentDialogVisible"
        :agent="editingAgent"
        :existing-names="otherAgentNames"
        @confirm="onSnmpAgentConfirm"
      />
    </template>

    <fieldset v-if="draft.class === 'Chassis'" class="form-fieldset">
      <legend>Controller</legend>
      <div class="form-fields">
        <FormField label="Controller" group>
          <ObjectPickerField
            v-model="draft.controllerId"
            empty-label="None"
            dialog-title="Select Controller Node"
            :perspectives="proxyPerspectives"
            :selectable="isNodeSelectable"
          />
        </FormField>
        <label class="flag-row">
          <Checkbox
            v-model="draft.bindUnderController"
            :binary="true"
            :disabled="!settingsSupported"
          />
          <span class="flag-label">Bind chassis object under controller node object</span>
        </label>
        <p v-if="!settingsSupported" class="form-hint">
          This server does not report this flag yet.
        </p>
      </div>
    </fieldset>

    <fieldset v-if="draft.class === 'Sensor'" class="form-fieldset">
      <legend>Modbus</legend>
      <div class="form-fields">
        <p v-if="!settingsSupported" class="form-hint">
          This server does not report the Modbus unit ID yet.
        </p>
        <FormField v-else label="Unit ID" v-slot="{ id }">
          <InputNumber
            v-model="draft.modbus.unitId"
            :input-id="id"
            :min="0"
            :max="255"
            :use-grouping="false"
            :allow-empty="false"
            class="unit-id-input"
          />
        </FormField>
      </div>
    </fieldset>

    <fieldset v-if="!isNode" class="form-fieldset">
      <legend>Web Services</legend>
      <div class="form-fields">
        <p v-if="!settingsSupported" class="form-hint">
          This server does not report the web service proxy yet.
        </p>
        <FormField v-else label="Proxy" group>
          <ObjectPickerField
            v-model="draft.webServiceProxy"
            empty-label="Default"
            dialog-title="Select Web Service Proxy Node"
            :perspectives="proxyPerspectives"
            :selectable="isNodeSelectable"
          />
        </FormField>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.communication-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

:deep(.form-input input) {
  max-width: 100%;
}

.snmp-top-row {
  display: grid;
  grid-template-columns: 9rem 8rem 1fr;
  gap: 0.75rem;
}

.snmp-trap-row {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.75rem;
}

.agent-top-row {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: 0.75rem;
}

.agent-port-input {
  width: 100%;
}

:deep(.agent-port-input .p-inputnumber-input) {
  width: 100%;
}

.form-subsection {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-surface-border);
}

.subsection-title {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.subsection-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.flags-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.flag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.8125rem;
  user-select: none;
}

.flag-label {
  line-height: 1.3;
}

.form-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.unit-id-input {
  width: 8rem;
}

.agent-table-card {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow-x: auto;
}

.agent-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.agent-table th {
  text-align: left;
  padding: 0.375rem 0.5rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border-bottom: 1px solid var(--p-surface-border);
  border-right: 1px solid var(--p-surface-border);
  white-space: nowrap;
}

.agent-table th:last-child {
  border-right: none;
}

.agent-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
  border-bottom: 1px solid var(--p-surface-border);
  border-right: 1px solid var(--p-surface-border);
}

.agent-table td:last-child {
  border-right: none;
}

.agent-table tbody tr:last-child td {
  border-bottom: none;
}

.col-name,
.col-address,
.col-auth,
.col-context {
  min-width: 7rem;
}

.col-port,
.col-version {
  width: 4rem;
  white-space: nowrap;
}

.col-actions {
  width: 5rem;
  white-space: nowrap;
}

.cell-wrap {
  word-break: break-word;
}

.cell-muted {
  color: var(--p-text-muted-color);
}

.empty-state {
  text-align: center;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.75rem 0.5rem;
}

.agent-actions {
  display: flex;
  justify-content: flex-end;
}

.triple-field {
  max-width: 28rem;
}

.secret-input {
  width: 100%;
}

:deep(.secret-input),
:deep(.secret-input .p-password-input) {
  width: 100%;
}
</style>
