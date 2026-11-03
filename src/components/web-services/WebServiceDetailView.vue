<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useConfirm } from 'primevue/useconfirm'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import {
  useCreateWebServiceDefinition,
  useUpdateWebServiceDefinition,
} from '@/queries/useWebServiceQueries'

const props = defineProps({
  /** Existing definition object for edit mode, or null for create mode. */
  definition: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const HTTP_METHODS = [
  { value: 0, label: 'GET' },
  { value: 1, label: 'POST' },
  { value: 2, label: 'PUT' },
  { value: 3, label: 'DELETE' },
  { value: 4, label: 'PATCH' },
]

const AUTH_TYPES = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Basic' },
  { value: 2, label: 'Digest' },
  { value: 3, label: 'NTLM' },
  { value: 4, label: 'Bearer' },
  { value: 5, label: 'Any' },
]

const FLAG_VERIFY_CERT = 1
const FLAG_VERIFY_HOST = 2
const FLAG_PLAIN_TEXT = 4
const FLAG_FOLLOW_LOC = 8

let _keyCounter = 0

function makeHeader(h) {
  return { name: h?.name ?? '', value: h?.value ?? '', _key: ++_keyCounter }
}

function buildForm(def) {
  return {
    name: def?.name ?? '',
    description: def?.description ?? '',
    url: def?.url ?? '',
    httpRequestMethod: def?.httpRequestMethod ?? 0,
    requestData: def?.requestData ?? '',
    authType: def?.authType ?? 0,
    login: def?.login ?? '',
    password: def?.password ?? '',
    cacheRetentionTime: def?.cacheRetentionTime ?? 0,
    requestTimeout: def?.requestTimeout ?? 30000,
    flags: def?.flags ?? 3,
    headers: (def?.headers ?? []).map(makeHeader),
  }
}

function formSnapshot(f) {
  return {
    name: f.name,
    description: f.description,
    url: f.url,
    httpRequestMethod: f.httpRequestMethod,
    requestData: f.requestData,
    authType: f.authType,
    login: f.login,
    password: f.password,
    cacheRetentionTime: f.cacheRetentionTime,
    requestTimeout: f.requestTimeout,
    flags: f.flags,
    headers: f.headers.map(({ name, value }) => ({ name, value })),
  }
}

const form = ref(buildForm(props.definition))
const activeTab = ref('general')

watch(
  () => props.definition,
  (def) => {
    form.value = buildForm(def)
    selectedHeader.value = null
    activeTab.value = 'general'
  },
)

const isDirty = computed(
  () =>
    JSON.stringify(formSnapshot(form.value)) !==
    JSON.stringify(formSnapshot(buildForm(props.definition))),
)

defineExpose({ isDirty })

const confirm = useConfirm()

function tryClose() {
  if (isDirty.value) {
    confirm.require({
      header: 'Unsaved Changes',
      message: 'Discard unsaved changes?',
      icon: 'pi pi-exclamation-triangle',
      rejectLabel: 'Cancel',
      acceptLabel: 'Discard',
      acceptSeverity: 'danger',
      accept: () => emit('close'),
    })
  } else {
    emit('close')
  }
}

const flagVerifyCert = computed({
  get: () => !!(form.value.flags & FLAG_VERIFY_CERT),
  set: (v) => {
    form.value.flags = v
      ? form.value.flags | FLAG_VERIFY_CERT
      : form.value.flags & ~FLAG_VERIFY_CERT
  },
})
const flagVerifyHost = computed({
  get: () => !!(form.value.flags & FLAG_VERIFY_HOST),
  set: (v) => {
    form.value.flags = v
      ? form.value.flags | FLAG_VERIFY_HOST
      : form.value.flags & ~FLAG_VERIFY_HOST
  },
})
const flagPlainText = computed({
  get: () => !!(form.value.flags & FLAG_PLAIN_TEXT),
  set: (v) => {
    form.value.flags = v ? form.value.flags | FLAG_PLAIN_TEXT : form.value.flags & ~FLAG_PLAIN_TEXT
  },
})
const flagFollowLoc = computed({
  get: () => !!(form.value.flags & FLAG_FOLLOW_LOC),
  set: (v) => {
    form.value.flags = v ? form.value.flags | FLAG_FOLLOW_LOC : form.value.flags & ~FLAG_FOLLOW_LOC
  },
})

const showRequestData = computed(
  () => form.value.httpRequestMethod !== 0 && form.value.httpRequestMethod !== 3,
)
const showAuthFields = computed(() => form.value.authType !== 0)

const selectedHeader = ref(null)

function addHeader() {
  form.value.headers.push(makeHeader())
}

function removeHeader() {
  if (!selectedHeader.value) return
  const idx = form.value.headers.indexOf(selectedHeader.value)
  if (idx !== -1) {
    form.value.headers.splice(idx, 1)
    selectedHeader.value = null
  }
}

const {
  mutate: createDefinition,
  isPending: isCreating,
  error: createError,
} = useCreateWebServiceDefinition()
const {
  mutate: updateDefinition,
  isPending: isUpdating,
  error: updateError,
} = useUpdateWebServiceDefinition()

const isNew = computed(() => props.definition === null)
const isPending = computed(() => isCreating.value || isUpdating.value)
const mutationError = computed(() => createError.value || updateError.value)

const title = computed(() =>
  isNew.value ? 'New Definition' : (props.definition?.name ?? 'Web Service Definition'),
)

const canSave = computed(
  () => isDirty.value && form.value.name.trim() !== '' && form.value.url.trim() !== '',
)

function buildPayload() {
  return {
    name: form.value.name,
    description: form.value.description || undefined,
    url: form.value.url,
    httpRequestMethod: form.value.httpRequestMethod,
    requestData: form.value.requestData || undefined,
    authType: form.value.authType,
    login: form.value.login || undefined,
    password: form.value.password || undefined,
    cacheRetentionTime: form.value.cacheRetentionTime,
    requestTimeout: form.value.requestTimeout,
    flags: form.value.flags,
    headers: form.value.headers.map(({ name, value }) => ({ name, value })),
  }
}

function save() {
  const payload = buildPayload()
  if (isNew.value) {
    createDefinition(payload, {
      onSuccess: (result) => emit('saved', result),
    })
  } else {
    updateDefinition(
      { id: props.definition.id, data: payload },
      {
        onSuccess: () => emit('saved'),
      },
    )
  }
}

function discard() {
  if (isNew.value) {
    emit('close')
  } else {
    form.value = buildForm(props.definition)
    selectedHeader.value = null
  }
}
</script>

<template>
  <div class="ws-detail">
    <EntityDetailHeader :title="title" subtitle="Web Service Definition" @back="tryClose">
      <template #actions>
        <Button
          label="Discard"
          icon="pi pi-times"
          severity="secondary"
          size="small"
          :disabled="!isDirty && !isNew"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          severity="primary"
          size="small"
          :disabled="!canSave || isPending"
          :loading="isPending"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <Tabs v-model:value="activeTab" class="detail-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="headers">
          Headers
          <span v-if="form.headers.length > 0" class="tab-count">({{ form.headers.length }})</span>
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="detail-cards-grid">
            <MutationErrorState :error="mutationError" class="error-message" />

            <DetailCard title="General">
              <div class="detail-field">
                <label for="ws-name">Name</label>
                <InputText
                  id="ws-name"
                  v-model="form.name"
                  placeholder="Definition name"
                  class="field-input"
                />
              </div>
              <div class="detail-field detail-field-block">
                <label for="ws-description">Description</label>
                <Textarea
                  id="ws-description"
                  v-model="form.description"
                  placeholder="Optional description"
                  rows="3"
                  class="field-textarea"
                />
              </div>
            </DetailCard>

            <DetailCard title="Request">
              <div class="detail-field">
                <label for="ws-url">URL</label>
                <InputText
                  id="ws-url"
                  v-model="form.url"
                  placeholder="https://example.com/api"
                  class="field-input field-mono"
                />
              </div>
              <div class="detail-field">
                <label for="ws-method">Method</label>
                <Select
                  id="ws-method"
                  v-model="form.httpRequestMethod"
                  :options="HTTP_METHODS"
                  option-label="label"
                  option-value="value"
                  class="field-input"
                />
              </div>
              <div v-if="showRequestData" class="detail-field detail-field-block">
                <label for="ws-request-data">Request body</label>
                <Textarea
                  id="ws-request-data"
                  v-model="form.requestData"
                  placeholder="Request body data"
                  rows="4"
                  class="field-textarea field-mono"
                />
              </div>
            </DetailCard>

            <DetailCard title="Authentication">
              <div class="detail-field">
                <label for="ws-auth-type">Auth type</label>
                <Select
                  id="ws-auth-type"
                  v-model="form.authType"
                  :options="AUTH_TYPES"
                  option-label="label"
                  option-value="value"
                  class="field-input"
                />
              </div>
              <template v-if="showAuthFields">
                <div class="detail-field">
                  <label for="ws-login">Login / Token</label>
                  <InputText
                    id="ws-login"
                    v-model="form.login"
                    placeholder="Username or token"
                    class="field-input"
                  />
                </div>
                <div class="detail-field">
                  <label for="ws-password">Password</label>
                  <InputText
                    id="ws-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Password"
                    class="field-input"
                  />
                </div>
              </template>
            </DetailCard>

            <DetailCard title="Options" :wide="true">
              <div class="options-grid">
                <div class="detail-field">
                  <label for="ws-timeout">Request timeout</label>
                  <div class="input-with-unit">
                    <InputNumber
                      id="ws-timeout"
                      v-model="form.requestTimeout"
                      :min="0"
                      :max="300000"
                      :step="1000"
                      class="field-input"
                    />
                    <span class="unit-label">ms</span>
                  </div>
                </div>
                <div class="detail-field">
                  <label for="ws-cache">Cache retention</label>
                  <div class="input-with-unit">
                    <InputNumber
                      id="ws-cache"
                      v-model="form.cacheRetentionTime"
                      :min="0"
                      class="field-input"
                    />
                    <span class="unit-label">ms</span>
                  </div>
                </div>
                <div class="options-checkboxes">
                  <div class="option-check">
                    <Checkbox v-model="flagVerifyCert" input-id="ws-verify-cert" :binary="true" />
                    <label for="ws-verify-cert">Verify peer's certificate</label>
                  </div>
                  <div class="option-check">
                    <Checkbox v-model="flagVerifyHost" input-id="ws-verify-host" :binary="true" />
                    <label for="ws-verify-host">Verify hostname in certificate</label>
                  </div>
                  <div class="option-check">
                    <Checkbox v-model="flagFollowLoc" input-id="ws-follow-loc" :binary="true" />
                    <label for="ws-follow-loc">Follow Location header in 3xx response</label>
                  </div>
                  <div class="option-check">
                    <Checkbox v-model="flagPlainText" input-id="ws-plain-text" :binary="true" />
                    <label for="ws-plain-text">Process response as plain text</label>
                  </div>
                </div>
              </div>
            </DetailCard>
          </div>
        </TabPanel>

        <TabPanel value="headers">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <span class="tab-toolbar-title">HTTP Headers</span>
              <div class="tab-toolbar-actions">
                <Button
                  label="Add"
                  icon="pi pi-plus"
                  size="small"
                  severity="primary"
                  @click="addHeader"
                />
                <Button
                  label="Remove"
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  text
                  :disabled="!selectedHeader"
                  @click="removeHeader"
                />
              </div>
            </div>

            <DataTable
              v-model:selection="selectedHeader"
              :value="form.headers"
              data-key="_key"
              selection-mode="single"
              class="headers-table"
            >
              <template #empty>
                <div class="table-empty">No headers defined. Click Add to add a header.</div>
              </template>
              <Column header="Name" style="width: 40%">
                <template #body="{ data }">
                  <InputText
                    v-model="data.name"
                    placeholder="Header name"
                    size="small"
                    class="cell-input"
                    @click.stop
                  />
                </template>
              </Column>
              <Column header="Value">
                <template #body="{ data }">
                  <InputText
                    v-model="data.value"
                    placeholder="Header value"
                    size="small"
                    class="cell-input"
                    @click.stop
                  />
                </template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.ws-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.tab-count {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-left: 0.125rem;
}

.detail-cards-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

.error-message {
  grid-column: 1 / -1;
  margin: 0;
}

.detail-field {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field > label:first-child {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 8.5rem;
  flex-shrink: 0;
}

.detail-field-block {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding-top: 0.625rem;
}

.detail-field-block > label:first-child {
  width: auto;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.field-textarea {
  width: 100%;
  resize: vertical;
}

.input-with-unit {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-with-unit .field-input {
  flex: 1;
}

.unit-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.options-grid .detail-field {
  grid-column: 1 / -1;
}

.options-checkboxes {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 2rem;
  padding: 0.5rem 0;
}

.option-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.option-check label {
  font-size: 0.8125rem;
  cursor: pointer;
}

.tab-content--table {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.tab-toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.tab-toolbar-actions {
  display: flex;
  gap: 0.25rem;
}

.headers-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.25rem 0.5rem;
  --p-datatable-header-cell-padding: 0.25rem 0.75rem;
}

.cell-input {
  width: 100%;
}

.table-empty {
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  text-align: center;
  font-style: italic;
}
</style>
