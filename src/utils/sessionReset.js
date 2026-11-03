/**
 * Per-account state outside the query cache (stores, composable singletons, tool WebSockets).
 * Logout does not reload the page and `useSessionSync` reloads only the other tabs, so without
 * this the next user in this tab would inherit the previous user's state. Stores that watch
 * `authStore.sessionGuid` themselves are not listed.
 */
import { useScriptStore } from '@/stores/scriptStore'
import { useToolExecutionStore } from '@/stores/toolExecutionStore'
import { usePollExecutionStore } from '@/stores/pollExecutionStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useObjectIconStore } from '@/stores/objectIconStore'
import { useViewStore } from '@/stores/viewStore'
import { closeAllToolStreams } from '@/composables/useToolExecution'
import { clearWorkingState } from '@/composables/useWorkingState'
import { resetChat } from '@/composables/useAiChat'
import { closeAiChat } from '@/composables/useLayout'
import { moduleRegistry } from '@/modules'
import { disconnectUserPreferences } from '@/utils/userPreferencesSync'

export function resetSessionState() {
  // The cached values stay, so the login page keeps the user's look.
  disconnectUserPreferences()

  // Sockets first: their close handlers write to the execution store, and the writes are
  // no-ops once the executions are gone.
  closeAllToolStreams()

  useScriptStore().reset()
  useToolExecutionStore().reset()
  usePollExecutionStore().reset()
  useSelectionStore().reset()
  // A category draft previewed by one user must not greet the next one.
  useObjectIconStore().stopPreview()
  // Filters, selections and open rows name the previous account's objects.
  useViewStore().resetTabState()
  clearWorkingState()

  resetChat()
  closeAiChat()

  moduleRegistry.setServerComponents(null)
}
