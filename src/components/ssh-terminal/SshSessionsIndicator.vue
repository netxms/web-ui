<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import AppLink from '@/components/common/AppLink.vue'
import { useSshTerminalStore } from '@/stores/sshTerminalStore'
import { objectTarget } from '@/utils/routeTargets'

const store = useSshTerminalStore()
const pop = ref(null)

const count = computed(() => store.liveSessions.length)
const label = computed(() =>
  count.value === 1 ? '1 open SSH terminal' : `${count.value} open SSH terminals`,
)

function targetFor(session) {
  return objectTarget({ id: session.objectId, class: 'Node' }, session.viewId)
}

function who(session) {
  if (session.phase === 'reconnecting') return 'reconnecting'
  if (session.phase === 'connecting') return 'connecting'
  return session.usesStored ? 'stored credentials' : session.login
}
</script>

<template>
  <template v-if="count > 0">
    <Button
      v-tooltip.bottom="label"
      icon="pi pi-desktop"
      :badge="String(count)"
      text
      severity="secondary"
      :aria-label="label"
      @click="pop.toggle($event)"
    />
    <Popover ref="pop">
      <ul class="ssh-sessions">
        <li v-for="session in store.liveSessions" :key="session.key" class="ssh-session">
          <AppLink :to="targetFor(session)" class="ssh-session-link" @activate="pop?.hide()">
            <span class="ssh-session-name">{{ session.objectName }}</span>
            <span class="ssh-session-who">{{ session.label }}, {{ who(session) }}</span>
          </AppLink>
          <Button
            v-tooltip.bottom="'Disconnect and close'"
            :aria-label="`Close ${session.label} on ${session.objectName}`"
            icon="pi pi-times"
            text
            severity="secondary"
            size="small"
            @click="store.closeSession(session.key)"
          />
        </li>
      </ul>
    </Popover>
  </template>
</template>

<style scoped>
.ssh-sessions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 22rem;
}

.ssh-session {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ssh-session-link {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
}

.ssh-session-link:hover {
  background: var(--p-surface-hover);
}

.ssh-session-name {
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.ssh-session-who {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow-wrap: anywhere;
}
</style>
