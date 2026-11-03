<script setup>
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AppLink from '@/components/common/AppLink.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { useEppChainCallers } from '@/queries/useEppQueries'
import { chainLabel } from '@/utils/eppChains'
import { eppChainTarget } from '@/utils/routeTargets'

// Deleting a chain strips every call to it from rules in other chains, so those rules are
// listed here, as in the desktop console.
defineOptions({ name: 'EppChainDeleteDialog' })

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** null while the dialog is closed. */
  chain: { type: Object, default: null },
  /** For naming the chain each calling rule lives in. */
  chains: { type: Array, default: () => [] },
  deleting: { type: Boolean, default: false },
  error: { type: [String, Object, Error], default: null },
})

const emit = defineEmits(['update:visible', 'confirm'])

const chainId = computed(() => props.chain?.id ?? null)

const {
  data: callers,
  isLoading: loadingCallers,
  isError: callersFailed,
} = useEppChainCallers(chainId, { enabled: computed(() => props.visible) })

const chainsById = computed(() => new Map(props.chains.map((chain) => [chain.id, chain])))

function callerChainLabel(caller) {
  return chainLabel(chainsById.value.get(caller.chainId) ?? { id: caller.chainId })
}

const ruleCount = computed(() => props.chain?.ruleCount ?? 0)
</script>

<template>
  <Dialog
    :visible="visible"
    header="Delete Rule Chain"
    modal
    :style="{ width: '34rem' }"
    :closable="!deleting"
    @update:visible="emit('update:visible', false)"
  >
    <div class="delete-body">
      <MutationErrorState :error="error" class="form-error" />

      <p class="lead">
        Delete <strong>{{ chainLabel(chain) }}</strong>
        <template v-if="ruleCount"> and its {{ $plural(ruleCount, 'rule') }}</template
        >? This cannot be undone.
      </p>

      <LoadingState v-if="loadingCallers" compact message="Checking which rules call this chain…" />

      <Message v-else-if="callersFailed" severity="warn" :closable="false">
        Could not load the rules calling this chain. Deleting will still remove those calls.
      </Message>

      <template v-else-if="callers?.length">
        <p class="callers-lead">
          {{ $plural(callers.length, 'rule') }} will lose their call to this chain:
        </p>
        <ul class="callers">
          <li v-for="caller in callers" :key="caller.ruleGuid">
            <AppLink
              :to="eppChainTarget(caller.chainId, { ruleGuid: caller.ruleGuid })"
              class="caller-link"
            >
              <span class="caller-chain">{{ callerChainLabel(caller) }}</span>
              <span class="caller-number">#{{ caller.ruleNumber }}</span>
              <span class="caller-comment">{{ caller.comments || 'unnamed rule' }}</span>
            </AppLink>
          </li>
        </ul>
        <p class="callers-note">
          Those chains get a new version, so any unsaved edits to them will need a reload before
          they can be saved.
        </p>
      </template>

      <p v-else class="callers-lead">No rules call this chain.</p>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        text
        severity="secondary"
        :disabled="deleting"
        @click="emit('update:visible', false)"
      />
      <Button
        label="Delete Chain"
        icon="pi pi-trash"
        severity="danger"
        :loading="deleting"
        @click="emit('confirm')"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.delete-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.form-error {
  margin-bottom: 0;
}

.lead,
.callers-lead,
.callers-note {
  margin: 0;
}

.callers-lead {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.callers-note {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.callers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
}

.callers li + li {
  border-top: 1px solid var(--p-surface-border);
}

.caller-link {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.625rem;
  font-size: 0.8125rem;
}

.caller-link:hover {
  background: var(--p-surface-hover);
}

.caller-chain {
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.caller-number {
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.caller-comment {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
