<script setup>
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Message from 'primevue/message'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import { chainLabel, sortChains } from '@/utils/eppChains'

// Writes nothing: both chains hold working copies, and Save All applies the move.
defineOptions({ name: 'EppMoveRulesDialog' })

const props = defineProps({
  visible: { type: Boolean, required: true },
  rules: { type: Array, default: () => [] },
  chains: { type: Array, default: () => [] },
  /** Chain the rules are moving out of. */
  sourceChainId: { type: Number, default: 0 },
  error: { type: [String, Object, Error], default: null },
})

const emit = defineEmits(['update:visible', 'confirm'])

const targetChainId = ref(null)

const targetOptions = computed(() =>
  sortChains(props.chains.filter((chain) => chain.id !== props.sourceChainId)).map((chain) => ({
    value: chain.id,
    label: chainLabel(chain),
    description: chain.description,
  })),
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) targetChainId.value = null
  },
)

const sourceName = computed(() =>
  chainLabel(props.chains.find((chain) => chain.id === props.sourceChainId) ?? null),
)

const targetName = computed(() => {
  const target = props.chains.find((chain) => chain.id === targetChainId.value)
  return target ? chainLabel(target) : ''
})

/** Rules that call the chain they are about to land in would become a self-call. */
const selfCallingRules = computed(() =>
  targetChainId.value == null
    ? []
    : props.rules.filter((rule) => (rule.chainCalls ?? []).includes(targetChainId.value)),
)
</script>

<template>
  <Dialog
    :visible="visible"
    header="Move Rules to Another Chain"
    modal
    :style="{ width: '32rem' }"
    :closable="true"
    @update:visible="emit('update:visible', false)"
  >
    <div class="move-body">
      <MutationErrorState :error="error" class="form-error" />

      <p class="lead">
        Move {{ $plural(rules.length, 'rule') }} out of <strong>{{ sourceName }}</strong
        >. They keep their order and land at the end of the target chain.
      </p>

      <ul class="rule-preview">
        <li v-for="rule in rules.slice(0, 6)" :key="rule.guid">
          {{ rule.comments || 'unnamed rule' }}
        </li>
        <li v-if="rules.length > 6" class="rule-preview__more">and {{ rules.length - 6 }} more</li>
      </ul>

      <div class="form-field">
        <label for="move-target">Target chain</label>
        <Select
          id="move-target"
          v-model="targetChainId"
          :options="targetOptions"
          option-label="label"
          option-value="value"
          placeholder="Choose a chain…"
          :disabled="!targetOptions.length"
          empty-message="There is no other chain to move into"
          class="w-full"
        >
          <template #option="{ option }">
            <div class="target-option">
              <span class="target-label">{{ option.label }}</span>
              <span v-if="option.description" class="target-description">
                {{ option.description }}
              </span>
            </div>
          </template>
        </Select>
      </div>

      <Message v-if="selfCallingRules.length" severity="warn" :closable="false" class="move-note">
        {{ $plural(selfCallingRules.length, 'rule') }} already call {{ targetName }}. Once moved,
        that becomes a call to their own chain, which the server skips — remove the call afterwards.
      </Message>

      <Message severity="info" :closable="false" class="move-note">
        Nothing is saved yet: {{ sourceName }} and {{ targetName || 'the target chain' }} will both
        have unsaved changes. Use Save All to apply the move.
      </Message>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button
        label="Move"
        icon="pi pi-arrow-right"
        :disabled="targetChainId == null"
        @click="emit('confirm', targetChainId)"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.move-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding-top: 0.25rem;
}

.form-error {
  margin-bottom: 0;
}

.lead {
  margin: 0;
}

.rule-preview {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
  background: var(--p-surface-ground);
  font-size: 0.8125rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 9rem;
  overflow-y: auto;
}

.rule-preview li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-preview__more {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.target-option {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.target-label {
  font-weight: 500;
}

.target-description {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.move-note {
  margin: 0;
}
</style>
