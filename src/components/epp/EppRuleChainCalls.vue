<script setup>
import { computed, nextTick, ref } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import { callWouldLoop, chainLabel, isMainChain, sortChains } from '@/utils/eppChains'

// Calls run after the rule's own actions, and the stop-processing flag decides what happens
// when they return, so this sits next to that flag.
defineOptions({ name: 'EppRuleChainCalls' })

const props = defineProps({
  /** Ordered chain ids. */
  modelValue: { type: Array, default: () => [] },
  chains: { type: Array, default: () => [] },
  /** A rule cannot call its own chain. */
  currentChainId: { type: Number, default: 0 },
  /** `chain id → called chain ids`, for spotting a call that closes a loop. */
  callGraph: { type: Map, default: () => new Map() },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const chainsById = computed(() => new Map(props.chains.map((chain) => [chain.id, chain])))

const calls = computed(() =>
  props.modelValue.map((id) => ({
    id,
    chain: chainsById.value.get(id) ?? null,
    label: chainLabel(chainsById.value.get(id) ?? { id }),
    // Deleted between load and save: the server would reject the rule.
    missing: !chainsById.value.has(id),
    loops: callWouldLoop(props.currentChainId, id, props.callGraph),
  })),
)

const pickerValue = ref(null)

// The main chain is never offered: it is always running already, so a call to it is a loop the
// server skips (SYS_EPP_CHAIN_LOOP). An existing call to it stays visible so it can be removed.
const availableChains = computed(() => {
  const taken = new Set(props.modelValue)
  return sortChains(
    props.chains.filter(
      (chain) => !isMainChain(chain) && chain.id !== props.currentChainId && !taken.has(chain.id),
    ),
  ).map((chain) => ({
    value: chain.id,
    label: chainLabel(chain),
    description: chain.description,
    loops: callWouldLoop(props.currentChainId, chain.id, props.callGraph),
  }))
})

// The reset waits a tick: PrimeVue's Select only re-reads the prop when it changes between
// renders, so clearing in the same tick would leave the added chain showing.
async function onPickChain({ value }) {
  if (value == null) return
  emit('update:modelValue', [...props.modelValue, value])
  await nextTick()
  pickerValue.value = null
}

function removeCall(index) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

function moveCall(index, delta) {
  const next = [...props.modelValue]
  const target = index + delta
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('update:modelValue', next)
}

/** Whether or not already called; for the empty message. */
const callableChainCount = computed(
  () =>
    props.chains.filter((chain) => !isMainChain(chain) && chain.id !== props.currentChainId).length,
)

const loopingCalls = computed(() => calls.value.filter((call) => call.loops))
const missingCalls = computed(() => calls.value.filter((call) => call.missing))
</script>

<template>
  <div class="chain-calls">
    <ol v-if="calls.length" class="call-list">
      <li v-for="(call, index) in calls" :key="call.id" class="call-row">
        <span class="call-order">{{ index + 1 }}</span>
        <i :class="isMainChain(call.id) ? 'pi pi-sitemap' : 'pi pi-link'" class="call-icon" />
        <span class="call-name" :class="{ 'call-name--missing': call.missing }">
          {{ call.missing ? `Chain #${call.id} (deleted)` : call.label }}
        </span>
        <span v-if="call.chain?.description" class="call-description">
          {{ call.chain.description }}
        </span>
        <i
          v-if="call.loops"
          v-tooltip.top="'This call re-enters a chain that is already running'"
          class="pi pi-exclamation-triangle call-warning"
        />
        <div class="call-actions">
          <Button
            v-tooltip.top="'Move up'"
            icon="pi pi-chevron-up"
            size="small"
            severity="secondary"
            text
            :disabled="disabled || index === 0"
            :aria-label="`Move ${call.label} up`"
            @click="moveCall(index, -1)"
          />
          <Button
            v-tooltip.top="'Move down'"
            icon="pi pi-chevron-down"
            size="small"
            severity="secondary"
            text
            :disabled="disabled || index === calls.length - 1"
            :aria-label="`Move ${call.label} down`"
            @click="moveCall(index, 1)"
          />
          <Button
            v-tooltip.top="'Remove'"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            :disabled="disabled"
            :aria-label="`Remove call to ${call.label}`"
            @click="removeCall(index)"
          />
        </div>
      </li>
    </ol>

    <p v-else class="empty-hint">
      This rule does not enter any chain. Events stop at this rule's own actions.
    </p>

    <div class="add-row">
      <Select
        v-model="pickerValue"
        :options="availableChains"
        option-label="label"
        option-value="value"
        aria-label="Add a chain to call"
        placeholder="Add a chain to call…"
        size="small"
        :disabled="disabled || !availableChains.length"
        :empty-message="
          callableChainCount ? 'Every chain is already called' : 'No sub-chains to call'
        "
        style="flex: 1"
        @change="onPickChain"
      >
        <template #option="{ option }">
          <div class="picker-option">
            <span class="picker-label">{{ option.label }}</span>
            <span v-if="option.description" class="picker-description">
              {{ option.description }}
            </span>
            <i
              v-if="option.loops"
              v-tooltip.top="'Calling this chain would create a loop'"
              class="pi pi-exclamation-triangle picker-warning"
            />
          </div>
        </template>
      </Select>
    </div>

    <Message v-if="loopingCalls.length" severity="warn" :closable="false" class="call-message">
      {{ loopingCalls.map((c) => c.label).join(', ') }}
      {{ loopingCalls.length === 1 ? 'is' : 'are' }} already running by the time this rule is
      reached, so the call is skipped and reported as a SYS_EPP_CHAIN_LOOP event.
    </Message>

    <Message v-if="missingCalls.length" severity="error" :closable="false" class="call-message">
      This rule calls
      {{
        missingCalls.length === 1 ? 'a chain that no longer exists' : 'chains that no longer exist'
      }}. Remove {{ missingCalls.length === 1 ? 'it' : 'them' }} before saving — the server rejects
      a rule that calls a missing chain.
    </Message>
  </div>
</template>

<style scoped>
.chain-calls {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.call-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
}

.call-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  min-height: 2.25rem;
}

.call-row + .call-row {
  border-top: 1px solid var(--p-surface-border);
}

.call-order {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
  min-width: 1rem;
}

.call-icon {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.call-name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.call-name--missing {
  color: var(--p-red-500);
}

.call-description {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.call-warning,
.picker-warning {
  color: var(--p-orange-500);
  font-size: 0.8125rem;
}

.call-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
  flex-shrink: 0;
}

.empty-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.add-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.picker-option {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.picker-label {
  font-weight: 500;
}

.picker-description {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-message {
  margin: 0;
}
</style>
