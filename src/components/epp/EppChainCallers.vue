<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import AppLink from '@/components/common/AppLink.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useEppChainCallers } from '@/queries/useEppQueries'
import { chainLabel } from '@/utils/eppChains'
import { eppChainTarget } from '@/utils/routeTargets'

// "Called by N rules" for the open chain, expanding into the rules themselves.
defineOptions({ name: 'EppChainCallers' })

const props = defineProps({
  chain: { type: Object, default: null },
  /** For naming the chain each calling rule lives in. */
  chains: { type: Array, default: () => [] },
})

const popover = ref()
const opened = ref(false)

const chainId = computed(() => props.chain?.id ?? null)

// Deferred until the popover first opens; the count comes with the registry.
const {
  data: callers,
  isLoading,
  isError,
  error,
  refetch,
} = useEppChainCallers(chainId, { enabled: opened })

const count = computed(() => props.chain?.callerCount ?? 0)

const chainsById = computed(() => new Map(props.chains.map((chain) => [chain.id, chain])))

function callerChainLabel(caller) {
  return chainLabel(chainsById.value.get(caller.chainId) ?? { id: caller.chainId })
}

function toggle(event) {
  opened.value = true
  popover.value.toggle(event)
}
</script>

<template>
  <div class="chain-callers">
    <Button
      :label="`Called by ${count} ${count === 1 ? 'rule' : 'rules'}`"
      icon="pi pi-arrow-left"
      size="small"
      severity="secondary"
      text
      :disabled="!count"
      @click="toggle"
    />

    <Popover ref="popover">
      <div class="callers-panel">
        <LoadingState v-if="isLoading" compact message="Loading calling rules…" />
        <QueryErrorState v-else-if="isError" :error="error" @retry="refetch" />
        <template v-else-if="callers?.length">
          <p class="callers-lead">Events reach this chain through:</p>
          <ul class="callers">
            <li v-for="caller in callers" :key="caller.ruleGuid">
              <AppLink
                :to="eppChainTarget(caller.chainId, { ruleGuid: caller.ruleGuid })"
                class="caller-link"
                @activate="popover.hide()"
              >
                <span class="caller-chain">{{ callerChainLabel(caller) }}</span>
                <span class="caller-number">#{{ caller.ruleNumber }}</span>
                <span class="caller-comment">{{ caller.comments || 'unnamed rule' }}</span>
              </AppLink>
            </li>
          </ul>
        </template>
        <p v-else class="callers-lead">No rule calls this chain.</p>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.chain-callers {
  display: flex;
  align-items: center;
}

.callers-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 20rem;
  max-width: 28rem;
}

.callers-lead {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.callers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 16rem;
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

.caller-chain,
.caller-number {
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.caller-number {
  font-variant-numeric: tabular-nums;
}

.caller-comment {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
