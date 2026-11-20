<script setup>
import { computed } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import AppLink from '@/components/common/AppLink.vue'
import EppActionIcon from '@/components/epp/EppActionIcon.vue'
import { STEP_TITLES, ruleSteps, stopsProcessing } from '@/utils/eppRuleSummary'

defineOptions({ name: 'EppActionStrip' })

const props = defineProps({
  rule: { type: Object, required: true },
  /** `(actionId) => string` */
  actionNameFor: { type: Function, required: true },
  /** `(chainId) => string` */
  chainLabelFor: { type: Function, required: true },
  /** `(chainId) => RouteLocationRaw` */
  chainTargetFor: { type: Function, required: true },
})

/** One glyph per step, the alarm's add-ons included; chain calls stay links. */
const items = computed(() => {
  const out = []
  for (const step of ruleSteps(props.rule)) {
    if (step.type === 'chain-call') {
      out.push({ id: step.id, chainId: step.chainId })
      continue
    }
    out.push({ id: step.id, type: step.type, tip: tipFor(step) })
    for (const extra of step.extras ?? []) {
      out.push({ id: `${step.id}-${extra.type}`, type: extra.type, tip: STEP_TITLES[extra.type] })
    }
  }
  if (stopsProcessing(props.rule)) out.push({ id: 'stop', type: 'stop', tip: STEP_TITLES.stop })
  return out
})

function tipFor(step) {
  if (step.type === 'server-action') {
    const name = props.actionNameFor(step.actionId)
    return step.active ? `Run ${name}` : `Run ${name} (inactive)`
  }
  return STEP_TITLES[step.type]
}
</script>

<template>
  <div class="epp-action-strip">
    <template v-for="item in items" :key="item.id">
      <!-- `.stop` keeps the click off the row's expand handler; the anchor keeps new-tab
           clicks. -->
      <AppLink
        v-if="item.chainId != null"
        v-tooltip.top="`Go to the ${chainLabelFor(item.chainId)} chain`"
        :to="chainTargetFor(item.chainId)"
        class="epp-action-strip__chain"
        @click.stop
      >
        <ArrowRight :size="11" aria-hidden="true" />
        <span class="epp-action-strip__chain-name">{{ chainLabelFor(item.chainId) }}</span>
      </AppLink>
      <span
        v-else
        v-tooltip.top="item.tip"
        class="epp-action-strip__glyph"
        role="img"
        :aria-label="item.tip"
      >
        <EppActionIcon :type="item.type" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.epp-action-strip {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.125rem;
  min-width: 0;
  overflow: hidden;
}

.epp-action-strip__glyph {
  display: inline-grid;
  place-items: center;
  width: 1.375rem;
  height: 1.375rem;
  flex-shrink: 0;
}

/* Reads as an outbound edge rather than a status tag. */
.epp-action-strip__chain {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: 0.25rem;
  font-size: 0.7rem;
  line-height: 1.4;
  padding: 1px 6px 1px 4px;
  border: 1px solid var(--p-primary-color);
  border-radius: 0.75rem;
  color: var(--p-primary-color);
  min-width: 2.5rem;
  max-width: 9rem;
}

.epp-action-strip__chain:hover {
  background: var(--p-highlight-background);
}

.epp-action-strip__chain-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
