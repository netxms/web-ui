<script setup>
import Button from 'primevue/button'
import { computed } from 'vue'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'
import { configTarget } from '@/utils/routeTargets'

const props = defineProps({
  channel: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'delete', 'send-test', 'clear-queue', 'configure-bot'])

/**
 * Channels registered by a chat bot are server-managed: the server refuses update, rename and
 * delete on them, so the card offers "Configure bot" instead of Edit/Delete.
 */
const isBotProvided = computed(() => !!props.channel.providedByChatBot)

/** Chat bots share the channel name, so the channel name is the bot's detail entity ID. */
const botHref = computed(() =>
  isBotProvided.value
    ? resolveHref(configTarget('chat-bots', { entityId: props.channel.name }))
    : undefined,
)

// Plain left click navigates through the parent; modified clicks fall through to the anchor.
function onBotLinkClick(event) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  emit('configure-bot', props.channel)
}

const status = computed(() => {
  if (!props.channel.driverInitialized) {
    return { label: 'Not Initialized', class: 'status-error', icon: 'pi pi-times-circle' }
  }
  if (!props.channel.healthCheckStatus) {
    return { label: 'Unhealthy', class: 'status-warn', icon: 'pi pi-exclamation-circle' }
  }
  return { label: 'Healthy', class: 'status-ok', icon: 'pi pi-check-circle' }
})
</script>

<template>
  <div class="channel-card" :class="{ 'channel-card--system': isBotProvided }">
    <div class="card-header">
      <span v-if="isBotProvided" class="driver-chip driver-chatbot">
        <i class="pi pi-comments" />
        Chat bot
      </span>
      <span v-else class="driver-chip driver-other">{{ channel.driverName }}</span>
      <span class="status-badge" :class="status.class">
        <i :class="status.icon" />
        {{ status.label }}
      </span>
    </div>

    <div class="card-body">
      <p class="channel-name">{{ channel.name }}</p>
      <p v-if="channel.description" class="channel-description">{{ channel.description }}</p>
      <p v-else class="channel-description channel-description--empty">No description</p>
      <p v-if="channel.errorMessage" class="channel-error">
        <i class="pi pi-exclamation-triangle" />
        {{ channel.errorMessage }}
      </p>
      <p class="channel-stats">
        {{ channel.messageCount ?? 0 }} sent &middot; {{ channel.failureCount ?? 0 }} failed
        &middot; {{ channel.queueSize ?? 0 }} queued
      </p>
    </div>

    <div class="card-footer">
      <div class="footer-actions-left">
        <Button
          v-tooltip.top="'Send Test Notification'"
          aria-label="Send Test Notification"
          icon="pi pi-send"
          text
          size="small"
          severity="secondary"
          @click="emit('send-test', channel)"
        />
        <Button
          v-tooltip.top="'Clear Queue'"
          aria-label="Clear Queue"
          icon="pi pi-eraser"
          text
          size="small"
          severity="secondary"
          @click="emit('clear-queue', channel)"
        />
      </div>
      <div class="footer-actions-right">
        <Button
          v-if="isBotProvided"
          v-tooltip.top="'Managed by a chat bot - edit the bot to change this channel'"
          as="a"
          :href="botHref"
          label="Configure bot"
          icon="pi pi-external-link"
          text
          size="small"
          severity="secondary"
          @click="onBotLinkClick"
        />
        <template v-else>
          <Button
            label="Edit"
            icon="pi pi-pencil"
            text
            size="small"
            severity="secondary"
            @click="emit('edit', channel)"
          />
          <Button
            label="Delete"
            icon="pi pi-trash"
            text
            size="small"
            severity="danger"
            @click="emit('delete', channel)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.channel-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.channel-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem 0;
}

.driver-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.driver-other {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

.driver-chatbot {
  gap: 0.25rem;
  background: var(--p-primary-100);
  color: var(--p-primary-700);
}

/* Server-managed channel: same card surface, dashed border marks it as not editable. */
.channel-card--system {
  border-style: dashed;
  border-color: var(--p-surface-300);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
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

.card-body {
  flex: 1;
  padding: 0.625rem 0.875rem 0.5rem;
}

.channel-name {
  margin: 0 0 0.25rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--p-text-color);
}

.channel-description {
  margin: 0 0 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.channel-description--empty {
  font-style: italic;
}

.channel-error {
  margin: 0 0 0.375rem;
  font-size: 0.75rem;
  color: var(--p-red-500);
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
  line-height: 1.4;
}

.channel-error .pi {
  flex-shrink: 0;
  margin-top: 0.1em;
}

.channel-stats {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}

.footer-actions-left,
.footer-actions-right {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
