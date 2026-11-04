import { computed } from 'vue'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { useAiMessages } from '@/queries/useAiQueries'
import { isWaitingOnUser } from '@/utils/aiMessageDisplay'

/**
 * How many AI messages wait on this account. Polls only where the AI perspective is on offer, so
 * the rail costs nothing on a server without the assistant.
 */
export function useAiMessageAttention() {
  const { has } = useServerComponents()
  const { can } = usePermissions()

  const enabled = computed(
    () =>
      has(SERVER_COMPONENTS.AI_ASSISTANT) &&
      Boolean(can.value.useAiAssistant || can.value.viewEventLog),
  )

  const { data } = useAiMessages({ enabled })

  const count = computed(() =>
    enabled.value ? (data.value ?? []).filter((message) => isWaitingOnUser(message)).length : 0,
  )

  return { count }
}
