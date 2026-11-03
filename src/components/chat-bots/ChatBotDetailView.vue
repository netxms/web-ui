<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Message from 'primevue/message'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import AppLink from '@/components/common/AppLink.vue'
import ChatBotUserMappingDialog from '@/components/chat-bots/ChatBotUserMappingDialog.vue'
import {
  useChatBotDrivers,
  useCreateChatBot,
  useUpdateChatBot,
  useRenameChatBot,
} from '@/queries/useChatBotQueries'
import { useNotificationChannels } from '@/queries/useNotificationChannelQueries'
import { useUsers } from '@/queries/useUserQueries'
import {
  chatBotStatus,
  normalizeMappings,
  DEFAULT_IDLE_TIMEOUT,
  IDLE_TIMEOUT_MIN,
  IDLE_TIMEOUT_MAX,
  KNOWN_PROVIDER_SLOTS,
} from '@/utils/chatBotDisplay'
import { formatDurationCompact, formatAgeCompact, formatDateTime } from '@/utils/timeFormat'
import { configTarget } from '@/utils/routeTargets'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  /** null to create a new one. */
  bot: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved', 'created'])

const isNew = computed(() => props.bot === null)

function buildForm(bot) {
  return {
    name: bot?.name ?? '',
    description: bot?.description ?? '',
    driverName: bot?.driverName ?? null,
    configuration: bot?.configuration ?? '',
    idleTimeout: bot?.idleTimeout || DEFAULT_IDLE_TIMEOUT,
    providerSlot: bot?.providerSlot ?? '',
    mappings: (bot?.userMappings ?? []).map((m) => ({ peerId: m.peerId, userId: m.userId })),
  }
}

const form = ref(buildForm(props.bot))
/** Cleared once the operator types their own name, so the driver stops overwriting it. */
const nameFollowsDriver = ref(isNew.value)

// The server returns mappings in map order, so compare sorted, or Save stays enabled after a
// save.
function canonicalize(value) {
  return JSON.stringify({
    ...value,
    mappings: [...value.mappings].sort((a, b) => a.peerId.localeCompare(b.peerId)),
  })
}

const isDirty = computed(() => canonicalize(form.value) !== canonicalize(buildForm(props.bot)))

watch(
  () => props.bot,
  (bot) => {
    form.value = buildForm(bot)
    nameFollowsDriver.value = false
  },
)

const { data: driversData } = useChatBotDrivers()
const driverOptions = computed(() => (driversData.value ?? []).map((d) => ({ label: d, value: d })))

// Seeds the name until the operator types their own, as in the legacy create dialog.
function onDriverChange() {
  if (nameFollowsDriver.value) form.value.name = form.value.driverName ?? ''
}

function onNameInput() {
  nameFollowsDriver.value = false
}

const { data: channelsData } = useNotificationChannels()

const companionChannel = computed(() => {
  const name = props.bot?.name
  if (!name) return null
  return (channelsData.value ?? []).find((c) => c.name === name && c.providedByChatBot) ?? null
})

/** A standalone channel already owning the name blocks the bot's companion channel. */
const channelNameConflict = computed(() => {
  const name = form.value.name.trim()
  if (!name) return false
  return (channelsData.value ?? []).some((c) => c.name === name && !c.providedByChatBot)
})

// Worse on rename: the server checks a new bot name only against other bots, so the companion
// channel takes the name and hides the standalone channel until a server restart.
const channelConflictOnRename = computed(
  () => !isNew.value && form.value.name.trim() !== props.bot?.name,
)

const status = computed(() => chatBotStatus(props.bot))
const lastInbound = computed(() => formatAgeCompact(props.bot?.lastInboundMessageTime))

const { data: usersData } = useUsers()
const userNameById = computed(() => {
  const map = new Map()
  for (const user of usersData.value ?? []) map.set(user.id, user.name)
  return map
})

const mappingRows = computed(() =>
  form.value.mappings.map((m) => ({
    ...m,
    userName: userNameById.value.get(m.userId) ?? `[${m.userId}]`,
  })),
)

const mappingDialogVisible = ref(false)
const editedMapping = ref(null)

function openAddMapping() {
  editedMapping.value = null
  mappingDialogVisible.value = true
}

function openEditMapping(mapping) {
  editedMapping.value = { peerId: mapping.peerId, userId: mapping.userId }
  mappingDialogVisible.value = true
}

function onMappingSave(mapping) {
  const existing = form.value.mappings.findIndex((m) => m.peerId === mapping.peerId)
  if (existing === -1) form.value.mappings = [...form.value.mappings, mapping]
  else form.value.mappings = form.value.mappings.map((m, i) => (i === existing ? mapping : m))
  mappingDialogVisible.value = false
}

function removeMapping(mapping) {
  form.value.mappings = form.value.mappings.filter((m) => m.peerId !== mapping.peerId)
}

const usedPeerIds = computed(() => form.value.mappings.map((m) => m.peerId))

const { mutate: createBot, isPending: isCreating } = useCreateChatBot()
const { mutate: updateBot, isPending: isUpdating } = useUpdateChatBot()
const { mutate: renameBot, isPending: isRenaming } = useRenameChatBot()

const isPending = computed(() => isCreating.value || isUpdating.value || isRenaming.value)
const saveError = ref(null)
const nameError = ref(false)
const driverError = ref(false)

function validate() {
  nameError.value = !form.value.name.trim()
  driverError.value = !form.value.driverName
  return !nameError.value && !driverError.value
}

function payload() {
  return {
    description: form.value.description.trim(),
    driverName: form.value.driverName,
    configuration: form.value.configuration,
    idleTimeout: form.value.idleTimeout || DEFAULT_IDLE_TIMEOUT,
    providerSlot: form.value.providerSlot.trim(),
    userMappings: normalizeMappings(form.value.mappings),
  }
}

function save() {
  saveError.value = null
  if (!validate()) return

  const name = form.value.name.trim()

  if (isNew.value) {
    createBot(
      { name, ...payload() },
      {
        onSuccess: () => emit('created', name),
        onError: (err) => {
          saveError.value =
            err.status === 409
              ? `A chat bot named "${name}" already exists.`
              : (err.message ?? 'Failed to create chat bot.')
        },
      },
    )
    return
  }

  const originalName = props.bot.name

  const doRename = () => {
    renameBot(
      { name: originalName, newName: name },
      {
        onSuccess: () => emit('saved', name),
        onError: (err) => {
          saveError.value =
            err.status === 409
              ? `A chat bot named "${name}" already exists.`
              : (err.message ?? 'Failed to rename chat bot.')
        },
      },
    )
  }

  // Rename last: it invalidates the query keyed by the old name, dropping anything after it.
  updateBot(
    { name: originalName, data: payload() },
    {
      onSuccess: () => {
        if (name === originalName) emit('saved', originalName)
        else doRename()
      },
      onError: (err) => {
        saveError.value = err.message ?? 'Failed to update chat bot.'
      },
    },
  )
}

function discard() {
  saveError.value = null
  nameError.value = false
  driverError.value = false
  form.value = buildForm(props.bot)
  if (isNew.value) {
    nameFollowsDriver.value = true
    emit('close')
  }
}

const title = computed(() => (isNew.value ? 'New Chat Bot' : (props.bot?.name ?? 'Chat Bot')))

const activeTab = ref('general')
</script>

<template>
  <div class="chat-bot-detail">
    <EntityDetailHeader :title="title" subtitle="Chat Bot" @back="emit('close')">
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
          :disabled="!isDirty || isPending"
          :loading="isPending"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <Tabs v-model:value="activeTab" class="detail-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="mappings">User Mappings ({{ form.mappings.length }})</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="detail-cards-grid">
            <MutationErrorState :error="saveError" class="grid-message" />

            <Message
              v-if="channelNameConflict"
              :severity="channelConflictOnRename ? 'error' : 'warn'"
              :closable="false"
              class="grid-message"
            >
              <template v-if="channelConflictOnRename">
                A notification channel named "{{ form.name.trim() }}" already exists. Renaming the
                bot takes that name over: the existing channel disappears from the channel list
                until the server is restarted, and server actions that used it end up pointing at
                the bot's channel. Pick a different name, or delete that channel first.
              </template>
              <template v-else>
                A notification channel named "{{ form.name.trim() }}" already exists. The bot will
                work, but it cannot register its own notification channel until that channel is
                deleted.
              </template>
            </Message>

            <DetailCard title="General">
              <FormField
                class="detail-field"
                :class="{ 'field-error': driverError }"
                label="Driver"
                v-slot="{ id }"
              >
                <Select
                  :input-id="id"
                  id="bot-driver"
                  v-model="form.driverName"
                  :options="driverOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="Select driver"
                  class="field-input"
                  @change="onDriverChange"
                />
              </FormField>
              <FormField
                class="detail-field"
                :class="{ 'field-error': nameError }"
                label="Name"
                v-slot="{ id }"
              >
                <InputText
                  :id="id"
                  v-model="form.name"
                  maxlength="63"
                  placeholder="Chat bot name"
                  class="field-input"
                  @input="onNameInput"
                />
              </FormField>
              <FormField class="detail-field" label="Description" v-slot="{ id }">
                <InputText
                  :id="id"
                  v-model="form.description"
                  maxlength="255"
                  placeholder="Optional description"
                  class="field-input"
                />
              </FormField>
            </DetailCard>

            <DetailCard title="AI Session">
              <FormField class="detail-field" label="Idle timeout" group>
                <div class="field-input field-with-hint">
                  <InputNumber
                    id="bot-idle-timeout"
                    v-model="form.idleTimeout"
                    :min="IDLE_TIMEOUT_MIN"
                    :max="IDLE_TIMEOUT_MAX"
                    suffix=" s"
                    show-buttons
                    :step="60"
                    class="number-input"
                  />
                  <small class="hint-text">
                    {{ formatDurationCompact(form.idleTimeout) }} of inactivity closes the session
                  </small>
                </div>
              </FormField>
              <FormField class="detail-field" label="AI provider slot" group>
                <div class="field-input field-with-hint">
                  <InputText
                    id="bot-provider-slot"
                    v-model="form.providerSlot"
                    maxlength="31"
                    placeholder="Default slot"
                    class="w-full"
                  />
                  <small class="hint-text">
                    Leave empty for the default slot. Known slots:
                    {{ KNOWN_PROVIDER_SLOTS.join(', ') }}.
                  </small>
                </div>
              </FormField>
            </DetailCard>

            <DetailCard v-if="!isNew" title="Status">
              <FormField class="detail-field" label="Driver" group>
                <span class="status-badge" :class="status.class">
                  <i :class="status.icon" />
                  {{ status.label }}
                </span>
              </FormField>
              <FormField class="detail-field" label="Active sessions" group>
                <span class="field-value">{{ bot.activeSessions ?? 0 }}</span>
              </FormField>
              <FormField class="detail-field" label="Last inbound message" group>
                <span
                  v-tooltip.top="formatDateTime(bot.lastInboundMessageTime)"
                  class="field-value"
                >
                  {{ lastInbound || 'Never' }}
                </span>
              </FormField>
              <FormField
                v-if="bot.errorMessage"
                class="detail-field detail-field--top"
                label="Last error"
                group
              >
                <Message severity="error" :closable="false" class="inline-message">
                  {{ bot.errorMessage }}
                </Message>
              </FormField>
              <FormField class="detail-field" label="Notification channel" group>
                <span v-if="companionChannel" class="field-value">
                  <AppLink :to="configTarget('notification-channels')" class="channel-link">
                    {{ companionChannel.name }}
                    <i class="pi pi-external-link" />
                  </AppLink>
                </span>
                <span v-else class="field-value field-value--muted">Not registered</span>
              </FormField>
            </DetailCard>

            <DetailCard title="Driver Configuration" wide>
              <div class="detail-field detail-field-block">
                <Textarea
                  v-model="form.configuration"
                  :rows="10"
                  placeholder="Driver-specific configuration"
                  class="configuration-area"
                />
                <small class="hint-text">
                  Driver-specific <code>key=value</code> lines, one per line (for Telegram:
                  <code>AuthToken=...</code>).
                </small>
              </div>
            </DetailCard>
          </div>
        </TabPanel>

        <TabPanel value="mappings">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <div class="tab-toolbar-info">
                <span class="tab-toolbar-title">Platform Peer to NetXMS User</span>
                <span class="tab-toolbar-hint">
                  Messages from peers that are not listed here are ignored by the bot.
                </span>
              </div>
              <Button
                label="Add Mapping"
                icon="pi pi-plus"
                size="small"
                severity="primary"
                @click="openAddMapping"
              />
            </div>

            <DataTable :value="mappingRows" data-key="peerId" class="mappings-table">
              <template #empty>
                <div class="table-empty">
                  No user mappings. The bot will ignore every incoming message.
                </div>
              </template>
              <Column field="peerId" header="Peer ID" :sortable="true" style="width: 40%">
                <template #body="{ data }">
                  <span class="peer-id">{{ data.peerId }}</span>
                </template>
              </Column>
              <Column field="userName" header="User" :sortable="true" />
              <Column style="width: 6rem">
                <template #body="{ data }">
                  <div class="row-actions">
                    <Button
                      v-tooltip.top="'Edit'"
                      aria-label="Edit"
                      icon="pi pi-pencil"
                      text
                      size="small"
                      severity="secondary"
                      @click="openEditMapping(data)"
                    />
                    <Button
                      v-tooltip.top="'Remove'"
                      aria-label="Remove"
                      icon="pi pi-trash"
                      text
                      size="small"
                      severity="danger"
                      @click="removeMapping(data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>

  <ChatBotUserMappingDialog
    v-model:visible="mappingDialogVisible"
    :mapping="editedMapping"
    :used-peer-ids="usedPeerIds"
    @save="onMappingSave"
  />
</template>

<style scoped>
.chat-bot-detail {
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

.grid-message {
  grid-column: 1 / -1;
  margin: 0;
}

.detail-field {
  display: flex;
  /* The global .form-field in forms.css is column; a scoped rule only overrides what it names. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field > label:first-child,
/* FormField renders the label, so it carries no scope id of this file. */
.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 10rem;
  flex-shrink: 0;
}

.detail-field-block {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding-top: 0.75rem;
}

/* Label stays on the left while a multi-line value grows downwards. */
.detail-field--top {
  align-items: flex-start;
}

.detail-field--top > label:first-child {
  padding-top: 0.4375rem;
}

.field-input {
  flex: 1;
  min-width: 0;
}

:deep(.field-input input) {
  max-width: 100%;
}

.field-with-hint {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.number-input {
  width: 10rem;
}

.field-value {
  font-size: 0.875rem;
}

.field-value--muted {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.field-error :deep(.p-inputtext),
.field-error :deep(.p-select) {
  border-color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.hint-text code {
  font-family: var(--font-mono);
}

.inline-message {
  margin: 0;
  flex: 1;
  min-width: 0;
}

.configuration-area {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  resize: vertical;
}

.channel-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--p-primary-color);
}

.channel-link:hover {
  text-decoration: underline;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
}

.status-ok {
  color: var(--p-green-600);
}

.status-warn {
  color: var(--p-orange-600);
}

.status-error {
  color: var(--p-red-500);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.tab-toolbar-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tab-toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.tab-toolbar-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.mappings-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.3rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.peer-id {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.row-actions {
  display: flex;
  gap: 0.125rem;
  justify-content: flex-end;
}

.table-empty {
  text-align: center;
  padding: 2.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
