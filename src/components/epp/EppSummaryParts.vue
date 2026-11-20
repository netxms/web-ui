<script setup>
import { ArrowRight } from 'lucide-vue-next'
import AppLink from '@/components/common/AppLink.vue'
import StatusTag from '@/components/common/StatusTag.vue'

defineOptions({ name: 'EppSummaryParts' })

/**
 * One line of a rule summary. Each part is `{ k, v }` with `k` one of text, code, quote, chip,
 * badge, severity (`v` a severity code, or null for "same as event") or chain (`v` a chain id).
 */
defineProps({
  parts: { type: Array, required: true },
  chainLabelFor: { type: Function, default: (chainId) => `Chain #${chainId}` },
  /** `(chainId) => RouteLocationRaw` */
  chainTargetFor: { type: Function, default: null },
})
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <span v-if="part.k === 'text'" class="part-text">{{ part.v }}</span>
    <code v-else-if="part.k === 'code'" class="part-code">{{ part.v }}</code>
    <span v-else-if="part.k === 'quote'" class="part-quote">{{ part.v }}</span>
    <span v-else-if="part.k === 'chip'" class="part-chip">{{ part.v }}</span>
    <span v-else-if="part.k === 'badge'" class="part-badge">{{ part.v }}</span>
    <StatusTag v-else-if="part.k === 'severity' && part.v != null" :status="part.v" />
    <span v-else-if="part.k === 'severity'" class="part-chip">Same as event</span>
    <AppLink
      v-else-if="part.k === 'chain' && chainTargetFor"
      :to="chainTargetFor(part.v)"
      class="part-chain"
    >
      <ArrowRight :size="11" aria-hidden="true" />{{ chainLabelFor(part.v) }}
    </AppLink>
    <span v-else-if="part.k === 'chain'" class="part-chip">{{ chainLabelFor(part.v) }}</span>
  </template>
</template>

<style scoped>
.part-text {
  color: var(--p-text-muted-color);
}

.part-code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
  overflow-wrap: anywhere;
}

.part-quote {
  font-style: italic;
  color: var(--p-text-color);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.part-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.45rem;
  border-radius: 4px;
  background: var(--p-content-hover-background);
  font-size: 0.75rem;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part-badge {
  font-size: 0.6875rem;
  padding: 0 0.3rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  color: var(--p-text-muted-color);
}

.part-chain {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  padding: 0 0.45rem 0 0.3rem;
  border: 1px solid var(--p-primary-color);
  border-radius: 0.75rem;
  color: var(--p-primary-color);
}

.part-chain:hover {
  background: var(--p-highlight-background);
}
</style>
