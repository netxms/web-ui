<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import NotificationChannelCard from '@/components/notification-channels/NotificationChannelCard.vue'
import NotificationChannelDialog from '@/components/notification-channels/NotificationChannelDialog.vue'
import SendTestDialog from '@/components/notification-channels/SendTestDialog.vue'
import {
  useNotificationChannels,
  useNotificationDrivers,
  useCreateNotificationChannel,
  useUpdateNotificationChannel,
  useRenameNotificationChannel,
  useDeleteNotificationChannel,
  useClearNotificationChannelQueue,
  useSendNotification,
} from '@/queries/useNotificationChannelQueries'
import { configTarget } from '@/utils/routeTargets'

const confirm = useConfirm()
const toast = useToast()
const router = useRouter()

const { data: driversData } = useNotificationDrivers()
const drivers = computed(() => driversData.value ?? [])

const {
  data: channelsData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useNotificationChannels()
const channels = computed(() => channelsData.value ?? [])

// Channels a chat bot registered are server-managed and shown apart from the editable ones.
const regularChannels = computed(() => channels.value.filter((c) => !c.providedByChatBot))
const botChannels = computed(() => channels.value.filter((c) => c.providedByChatBot))

const dialogVisible = ref(false)
const editingChannel = ref(null)
const dialogError = ref(null)

function openCreate() {
  editingChannel.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(channel) {
  // The server refuses updates on bot-provided channels; the card offers no Edit for them.
  if (channel.providedByChatBot) return
  editingChannel.value = channel
  dialogError.value = null
  dialogVisible.value = true
}

function openChatBot(channel) {
  router.push(configTarget('chat-bots', { entityId: channel.name }))
}

const sendTestVisible = ref(false)
const sendTestTarget = ref(null)
const sendTestError = ref(null)

function openSendTest(channel) {
  sendTestTarget.value = channel
  sendTestError.value = null
  sendTestVisible.value = true
}

const { mutate: createChannel, isPending: isCreating } = useCreateNotificationChannel()
const { mutate: updateChannel, isPending: isUpdating } = useUpdateNotificationChannel()
const { mutate: renameChannel, isPending: isRenaming } = useRenameNotificationChannel()
const { mutate: deleteChannel } = useDeleteNotificationChannel()
const { mutate: clearQueue } = useClearNotificationChannelQueue()
const { mutate: sendNotification, isPending: isSending } = useSendNotification()

const isSaving = computed(() => isCreating.value || isUpdating.value || isRenaming.value)

function onDialogSave(payload) {
  dialogError.value = null

  if (editingChannel.value) {
    const { originalName, name, description, driverName, configuration } = payload
    const updateData = { description, driverName, configuration }

    const doUpdate = (channelName) => {
      updateChannel(
        { name: channelName, data: updateData },
        {
          onSuccess: () => {
            dialogVisible.value = false
          },
          onError: (err) => {
            dialogError.value = err.message ?? 'Failed to update channel.'
          },
        },
      )
    }

    if (name !== originalName) {
      renameChannel(
        { name: originalName, newName: name },
        {
          onSuccess: () => doUpdate(name),
          onError: (err) => {
            dialogError.value =
              err.status === 409
                ? `A channel named "${name}" already exists.`
                : (err.message ?? 'Failed to rename channel.')
          },
        },
      )
    } else {
      doUpdate(originalName)
    }
  } else {
    const { name, description, driverName, configuration } = payload
    createChannel(
      { name, description, driverName, configuration },
      {
        onSuccess: () => {
          dialogVisible.value = false
        },
        onError: (err) => {
          dialogError.value =
            err.status === 409
              ? `A channel named "${name}" already exists.`
              : (err.message ?? 'Failed to create channel.')
        },
      },
    )
  }
}

function confirmDelete(channel) {
  if (channel.providedByChatBot) return
  confirm.require({
    message: `Delete channel "${channel.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteChannel(channel.name, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Channel "${channel.name}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete channel.',
            life: 5000,
          })
        },
      })
    },
  })
}

function onClearQueue(channel) {
  clearQueue(channel.name, {
    onSuccess: () => {
      toast.add({
        severity: 'success',
        summary: 'Queue Cleared',
        detail: `Message queue for "${channel.name}" cleared.`,
        life: 3000,
      })
    },
    onError: (err) => {
      toast.add({
        severity: 'error',
        summary: 'Clear Failed',
        detail: err.message ?? 'Failed to clear queue.',
        life: 5000,
      })
    },
  })
}

function onSendTest(payload) {
  sendTestError.value = null
  sendNotification(
    { name: sendTestTarget.value.name, data: payload },
    {
      onSuccess: () => {
        sendTestVisible.value = false
        toast.add({
          severity: 'success',
          summary: 'Notification Queued',
          detail: `Test notification queued via "${sendTestTarget.value.name}".`,
          life: 3000,
        })
      },
      onError: (err) => {
        sendTestError.value = err.message ?? 'Failed to send notification.'
      },
    },
  )
}
</script>

<template>
  <div class="notification-channels-section">
    <SectionHeader title="Notification Channels" icon="pi pi-bell">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          label="Add Channel"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreate"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-content">
      <div v-if="isLoading" class="card-grid">
        <Skeleton v-for="i in 3" :key="i" height="9rem" border-radius="0.5rem" />
      </div>

      <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

      <div v-else-if="channels.length === 0" class="empty-state">
        <i class="pi pi-bell empty-icon" />
        <p class="empty-title">No notification channels configured</p>
        <p class="empty-subtitle">
          Add a notification channel to enable alerting via email, SMS, or other messaging services.
        </p>
        <Button
          label="Add First Channel"
          icon="pi pi-plus"
          severity="primary"
          @click="openCreate"
        />
      </div>

      <template v-else>
        <div v-if="regularChannels.length > 0" class="card-grid">
          <NotificationChannelCard
            v-for="channel in regularChannels"
            :key="channel.name"
            :channel="channel"
            @edit="openEdit"
            @delete="confirmDelete"
            @send-test="openSendTest"
            @clear-queue="onClearQueue"
          />
        </div>

        <!-- Registered by the server through a chat bot, not editable here -->
        <div v-if="botChannels.length > 0" class="channel-group">
          <div class="channel-group-header">
            <h3 class="channel-group-title">Chat bot provided</h3>
            <p class="channel-group-hint">
              Registered automatically by a chat bot. Edit the bot to change these.
            </p>
          </div>
          <div class="card-grid">
            <NotificationChannelCard
              v-for="channel in botChannels"
              :key="channel.name"
              :channel="channel"
              @send-test="openSendTest"
              @clear-queue="onClearQueue"
              @configure-bot="openChatBot"
            />
          </div>
        </div>
      </template>
    </div>
  </div>

  <NotificationChannelDialog
    v-model:visible="dialogVisible"
    :channel="editingChannel"
    :drivers="drivers"
    :saving="isSaving"
    :error="dialogError"
    @save="onDialogSave"
  />

  <SendTestDialog
    v-model:visible="sendTestVisible"
    :channel="sendTestTarget"
    :sending="isSending"
    :error="sendTestError"
    @send="onSendTest"
  />
</template>

<style scoped>
.notification-channels-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  align-content: start;
}

.channel-group {
  margin-top: 1.5rem;
}

.channel-group-header {
  margin-bottom: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--p-surface-border);
}

.channel-group-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
}

.channel-group-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 4rem 2rem;
  text-align: center;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 2.5rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.5rem;
}

.empty-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.empty-subtitle {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  max-width: 28rem;
}
</style>
