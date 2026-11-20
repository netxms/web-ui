<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import { ArrowDown, Clock, Filter, TriangleAlert } from 'lucide-vue-next'
import AppLink from '@/components/common/AppLink.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import EppActionIcon from '@/components/epp/EppActionIcon.vue'
import EppSummaryParts from '@/components/epp/EppSummaryParts.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import {
  STEP_TITLES,
  isFilterEmpty,
  ruleConditions,
  ruleErrors,
  ruleSteps,
  stopsProcessing,
} from '@/utils/eppRuleSummary'

defineOptions({ name: 'EppRuleSummary' })

const props = defineProps({
  rule: { type: Object, required: true },
  /** 'steps': filter and actions side by side; 'pipeline': one column joined by a line. */
  layout: { type: String, default: 'steps' },
  /** 1-based place in the chain, for saying where processing goes next. */
  position: { type: Number, default: null },
  ruleCount: { type: Number, default: null },
  inMainChain: { type: Boolean, default: true },
  /** Event code → event template. */
  eventTemplates: { type: Object, default: () => ({}) },
  objectsById: { type: Map, default: () => new Map() },
  /** Action id → server action. */
  serverActions: { type: Object, default: () => ({}) },
  /** Category id → alarm category. */
  alarmCategories: { type: Object, default: () => ({}) },
  chainLabelFor: { type: Function, default: (chainId) => `Chain #${chainId}` },
  /** `(chainId) => RouteLocationRaw` */
  chainTargetFor: { type: Function, default: null },
  /** `(section) => RouteLocationRaw`: this rule's editor, opened on a `RULE_SECTIONS` key. */
  sectionTargetFor: { type: Function, required: true },
})

const { linkBindings } = useNavTarget()

// Past this a list ends in a link to the editor, which shows all of it.
const LIST_LIMIT = 12

const CLAUSE_LABELS = {
  events: 'Event',
  sources: 'Source',
  severity: 'Severity',
  time: 'Time',
  script: 'Script',
}

const isPipeline = computed(() => props.layout === 'pipeline')
const clauses = computed(() => ruleConditions(props.rule))
const errors = computed(() => ruleErrors(props.rule))
const emptyFilter = computed(() => isFilterEmpty(props.rule))
const stops = computed(() => stopsProcessing(props.rule))
const steps = computed(() => ruleSteps(props.rule).map(describe))

const nextText = computed(() => {
  if (props.position == null || props.ruleCount == null) return 'Continues with the next rule'
  if (props.position < props.ruleCount) return `Continues to rule ${props.position + 1}`
  return props.inMainChain
    ? 'Last rule: processing of this event ends here'
    : 'Last rule: the rule that called this chain carries on'
})

function eventName(code) {
  return props.eventTemplates[code]?.name ?? `#${code}`
}

function eventSeverity(code) {
  return props.eventTemplates[code]?.severity ?? 5
}

function objectName(id) {
  return props.objectsById.get(id)?.name ?? `Object #${id}`
}

function hiddenCount(list) {
  return Math.max(0, list.length - LIST_LIMIT)
}

const text = (v) => ({ k: 'text', v })
const code = (v) => ({ k: 'code', v })
const chip = (v) => ({ k: 'chip', v })

function capped(list, toPart) {
  const parts = list.slice(0, LIST_LIMIT).map(toPart)
  if (list.length > LIST_LIMIT) parts.push(text(`and ${list.length - LIST_LIMIT} more`))
  return parts
}

function categoryLines(step) {
  if (step.categoryScript) {
    return [{ parts: [text('categories from script'), code(step.categoryScript)] }]
  }
  if (!step.categories.length) return []
  const label = step.categories.length === 1 ? 'category' : 'categories'
  const name = (id) => props.alarmCategories[id]?.name ?? `Category #${id}`
  return [{ parts: [text(label), ...capped(step.categories, (id) => chip(name(id)))] }]
}

function extraLines(step) {
  return step.extras.flatMap((extra) => {
    if (extra.type !== 'incident') {
      return [{ icon: extra.type, parts: [text(STEP_TITLES[extra.type])] }]
    }
    let what = `Create incident ${extra.delay ? `after ${extra.delay}` : 'immediately'}`
    if (extra.aiAnalysis) {
      what += extra.autoAssign ? ', with AI analysis and auto-assign' : ', with AI analysis'
    }
    const lines = [{ icon: 'incident', parts: [text(what)] }]
    if (extra.prompt) lines.push({ parts: [{ k: 'quote', v: extra.prompt }] })
    return lines
  })
}

function setRemoveParts(step) {
  const parts = []
  if (step.set.length) {
    parts.push(text('set'), ...capped(step.set, ([key, value]) => code(`${key} = "${value}"`)))
  }
  if (step.remove.length) parts.push(text('delete'), ...capped(step.remove, code))
  return parts
}

/** A step as a title, the parts on its line, and detail lines under it. */
function describe(step) {
  const out = { ...step, title: STEP_TITLES[step.type], parts: [], details: [] }
  switch (step.type) {
    case 'alarm-generate': {
      out.parts = [{ k: 'severity', v: step.severity }]
      if (step.message) out.parts.push(code(step.message))
      if (step.key) out.details.push({ parts: [text('key'), code(step.key)] })
      if (step.timeout) {
        out.details.push({
          parts: step.timeoutEvent
            ? [text(`timeout ${step.timeout}, then`), chip(eventName(step.timeoutEvent))]
            : [text(`timeout ${step.timeout}`)],
        })
      }
      if (step.flapCount) {
        out.details.push({
          parts: [
            text(`flap detection after ${step.flapCount} terminations within ${step.flapWindow}`),
          ],
        })
      }
      if (step.rootCauseScript) {
        out.details.push({ parts: [text('root cause script'), code(step.rootCauseScript)] })
      }
      if (step.impact) out.details.push({ parts: [text('impact'), code(step.impact)] })
      out.details.push(...categoryLines(step), ...extraLines(step))
      break
    }
    case 'alarm-resolve':
    case 'alarm-terminate':
      if (step.key) out.parts.push(text('key'), code(step.key))
      if (step.regex) out.parts.push({ k: 'badge', v: 'regex' })
      out.details.push(...categoryLines(step), ...extraLines(step))
      break
    case 'server-action': {
      out.parts.push(chip(props.serverActions[step.actionId]?.name ?? `Action #${step.actionId}`))
      if (!step.active) out.parts.push({ k: 'badge', v: 'inactive' })
      if (step.delay) {
        out.details.push({
          parts: step.timerKey
            ? [text(`after ${step.delay}, timer key`), code(step.timerKey)]
            : [text(`after ${step.delay}`)],
        })
      }
      if (step.blockingTimerKey) {
        out.details.push({
          parts: [text('skipped while timer'), code(step.blockingTimerKey), text('runs')],
        })
        if (step.snooze) {
          out.details.push({
            parts: [text(`then snoozes for ${step.snooze} on that timer`)],
          })
        }
      }
      break
    }
    case 'timer-cancel':
      out.parts = capped(step.keys, code)
      break
    case 'action-script':
      out.parts = [code(step.preview)]
      break
    case 'pstorage':
    case 'custom-attributes':
      out.parts = setRemoveParts(step)
      break
    case 'downtime-start':
    case 'downtime-end':
      if (step.tag) out.parts = [text('tag'), code(step.tag)]
      break
    case 'ai-instructions':
      out.details.push({ parts: [{ k: 'quote', v: step.text }] })
      break
    case 'chain-call':
      out.parts = [{ k: 'chain', v: step.chainId }]
      break
  }
  return out
}
</script>

<template>
  <div class="epp-summary" :class="`epp-summary--${layout}`">
    <ul v-if="errors.length" class="summary-errors">
      <li v-for="error in errors" :key="error.key">
        <TriangleAlert :size="14" aria-hidden="true" class="summary-errors__icon" />
        <AppLink :to="sectionTargetFor(error.section)" class="summary-link">
          {{ error.message }}
        </AppLink>
      </li>
    </ul>

    <div class="summary-body">
      <section class="summary-pane summary-when" aria-label="Filter">
        <header class="summary-head">
          <span v-if="isPipeline" class="summary-node summary-node--when">
            <Filter :size="15" aria-hidden="true" />
          </span>
          <span class="summary-head__title">Filter</span>
          <span v-if="!emptyFilter" class="summary-head__note">all of these match</span>
          <Button
            v-tooltip.bottom="'Edit filter'"
            as="a"
            v-bind="linkBindings(sectionTargetFor('condition'))"
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            severity="secondary"
            aria-label="Edit filter"
            class="summary-head__edit"
          />
        </header>

        <p v-if="emptyFilter" class="summary-warning">
          <TriangleAlert :size="14" aria-hidden="true" />
          Never matches: the filter is empty, and the server skips rules without one.
        </p>

        <dl v-else class="clauses">
          <template v-for="clause in clauses" :key="clause.key">
            <dt>
              <AppLink :to="sectionTargetFor(clause.section)" class="summary-link">
                {{ CLAUSE_LABELS[clause.key] }}
              </AppLink>
            </dt>
            <dd class="clause">
              <template v-if="clause.key === 'events'">
                <span class="clause__op">
                  is
                  <span v-if="clause.negated" class="clause__not">not</span>
                  <template v-if="clause.events.length > 1">one of</template>
                </span>
                <span
                  v-for="eventCode in clause.events.slice(0, LIST_LIMIT)"
                  :key="eventCode"
                  class="clause__chip"
                >
                  <StatusIcon :status="eventSeverity(eventCode)" size="0.8rem" />
                  {{ eventName(eventCode) }}
                </span>
                <AppLink
                  v-if="hiddenCount(clause.events)"
                  :to="sectionTargetFor(clause.section)"
                  class="summary-link clause__more"
                >
                  and {{ hiddenCount(clause.events) }} more
                </AppLink>
                <span v-if="clause.correlated" class="clause__note">incl. correlated events</span>
              </template>

              <template v-else-if="clause.key === 'sources'">
                <span class="clause__op">
                  is
                  <span v-if="clause.negated" class="clause__not">not</span>
                  <template v-if="!clause.sources.length">any object</template>
                  <template v-else-if="clause.sources.length > 1">one of</template>
                </span>
                <span
                  v-for="id in clause.sources.slice(0, LIST_LIMIT)"
                  :key="id"
                  class="clause__chip"
                >
                  <ObjectIcon
                    v-if="objectsById.get(id)"
                    :object="objectsById.get(id)"
                    size="0.85rem"
                  />
                  {{ objectName(id) }}
                </span>
                <AppLink
                  v-if="hiddenCount(clause.sources)"
                  :to="sectionTargetFor(clause.section)"
                  class="summary-link clause__more"
                >
                  and {{ hiddenCount(clause.sources) }} more
                </AppLink>
                <template v-if="clause.exclusions.length">
                  <span class="clause__op">except</span>
                  <span
                    v-for="id in clause.exclusions.slice(0, LIST_LIMIT)"
                    :key="`x${id}`"
                    class="clause__chip"
                  >
                    <ObjectIcon
                      v-if="objectsById.get(id)"
                      :object="objectsById.get(id)"
                      size="0.85rem"
                    />
                    {{ objectName(id) }}
                  </span>
                  <AppLink
                    v-if="hiddenCount(clause.exclusions)"
                    :to="sectionTargetFor(clause.section)"
                    class="summary-link clause__more"
                  >
                    and {{ hiddenCount(clause.exclusions) }} more
                  </AppLink>
                </template>
              </template>

              <template v-else-if="clause.key === 'severity'">
                <span class="clause__op">
                  {{
                    clause.severities.length
                      ? clause.severities.length > 1
                        ? 'is one of'
                        : 'is'
                      : 'is none of the five, so nothing matches'
                  }}
                </span>
                <StatusTag
                  v-for="severity in clause.severities"
                  :key="severity"
                  :status="severity"
                />
              </template>

              <template v-else-if="clause.key === 'time'">
                <span class="clause__op">
                  is
                  <span v-if="clause.negated" class="clause__not">not</span>
                  within
                </span>
                <span
                  v-for="(frame, i) in clause.frames"
                  :key="i"
                  class="clause__chip clause__chip--wrap"
                >
                  <Clock :size="12" aria-hidden="true" class="clause__chip-icon" />
                  {{ frame }}
                </span>
              </template>

              <template v-else-if="clause.key === 'script'">
                <span class="clause__op">returns true</span>
                <code class="clause__code">{{ clause.preview }}</code>
              </template>
            </dd>
          </template>
        </dl>
      </section>

      <section class="summary-pane summary-then" aria-label="Actions">
        <header v-if="!isPipeline" class="summary-head">
          <span class="summary-head__title">Action</span>
          <span v-if="steps.length > 1" class="summary-head__note">in run order</span>
          <Button
            v-tooltip.bottom="'Edit actions'"
            as="a"
            v-bind="linkBindings(sectionTargetFor('actions'))"
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            severity="secondary"
            aria-label="Edit actions"
            class="summary-head__edit"
          />
        </header>

        <ol v-if="steps.length" class="steps">
          <li v-for="step in steps" :key="step.id" class="step">
            <EppActionIcon :type="step.type" tile />
            <div class="step__body">
              <div class="step__line">
                <AppLink :to="sectionTargetFor(step.section)" class="summary-link step__title">
                  {{ step.title }}
                </AppLink>
                <EppSummaryParts
                  :parts="step.parts"
                  :chain-label-for="chainLabelFor"
                  :chain-target-for="chainTargetFor"
                />
              </div>
              <div v-for="(detail, i) in step.details" :key="i" class="step__detail">
                <EppActionIcon v-if="detail.icon" :type="detail.icon" :size="13" />
                <span v-else class="step__detail-pad" />
                <EppSummaryParts :parts="detail.parts" :chain-label-for="chainLabelFor" />
              </div>
            </div>
          </li>
        </ol>
        <p v-else class="summary-muted summary-no-actions">No actions</p>

        <div class="summary-end" :class="{ 'summary-end--stop': stops }">
          <template v-if="stops">
            <EppActionIcon type="stop" tile />
            <AppLink :to="sectionTargetFor('action-options')" class="summary-link step__title">
              {{ STEP_TITLES.stop }}
            </AppLink>
            <span class="summary-muted">No later rule sees this event</span>
          </template>
          <template v-else>
            <span class="summary-node summary-node--next">
              <ArrowDown :size="14" aria-hidden="true" />
            </span>
            <span class="summary-muted">{{ nextText }}</span>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.epp-summary {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.8125rem;
  white-space: normal;
}

.summary-errors {
  list-style: none;
  margin: 0;
  padding: 0.4rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  border: 1px solid var(--p-message-warn-border-color, var(--p-orange-300));
  background: var(--p-message-warn-background, var(--p-orange-50));
  color: var(--p-message-warn-color, var(--p-orange-700));
  border-radius: 6px;
}

.summary-errors li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.summary-errors .summary-link {
  text-decoration: underline;
}

.summary-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

@container (min-width: 56rem) {
  .epp-summary--steps .summary-body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.epp-summary--steps .summary-pane {
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.summary-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0 0.25rem 0 0.75rem;
}

.epp-summary--steps .summary-head {
  border-bottom: 1px solid var(--p-content-border-color);
}

.summary-head__title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--p-text-color);
}

.summary-head__note {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.summary-head__edit {
  margin-left: auto;
}

.summary-link {
  cursor: pointer;
}

.summary-link:hover {
  text-decoration: underline;
}

.summary-muted {
  color: var(--p-text-muted-color);
}

.summary-warning {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  color: var(--p-message-warn-color, var(--p-orange-700));
}

.clauses {
  margin: 0;
  padding: 0.6rem 0.75rem 0.75rem;
  display: grid;
  grid-template-columns: 4.25rem minmax(0, 1fr);
  gap: 0.5rem 0.75rem;
}

.clauses dt {
  color: var(--p-text-muted-color);
  line-height: 1.5rem;
}

.clause {
  margin: 0;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.375rem;
}

.clause__op {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--p-text-muted-color);
}

/* Negation is a word in the clause, never strikethrough: that look means "disabled". */
.clause__not {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.0625rem 0.35rem;
  border-radius: 4px;
  background: var(--p-text-color);
  color: var(--p-content-background);
}

.clause__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
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

/* Frame descriptions run long; a clipped one would hide the part that restricts. */
.clause__chip--wrap {
  white-space: normal;
}

.clause__chip-icon {
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.clause__note,
.clause__more {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.clause__code {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: var(--p-content-hover-background);
  overflow-wrap: anywhere;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0.6rem 0.75rem 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step {
  display: grid;
  grid-template-columns: 1.625rem minmax(0, 1fr);
  gap: 0.625rem;
  align-items: start;
}

.step__body {
  min-width: 0;
}

.step__line,
.step__detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.4rem;
}

.step__line {
  min-height: 1.625rem;
}

.step__detail {
  margin-top: 0.125rem;
  font-size: 0.78rem;
}

.step__detail-pad {
  width: 13px;
  flex-shrink: 0;
}

.step__title {
  font-weight: 600;
  color: var(--p-text-color);
}

.summary-no-actions {
  margin: 0;
  padding: 0.6rem 0.75rem 0.25rem;
}

.summary-end {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin: 0.375rem 0.75rem 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--p-content-border-color);
}

.summary-node {
  display: inline-grid;
  place-items: center;
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 6px;
  flex-shrink: 0;
}

.summary-node--next {
  color: var(--p-text-muted-color);
}

.summary-node--when {
  background: var(--p-highlight-background);
  color: var(--p-primary-color);
}

/* Pipeline: one card, a line through every node from the filter to the end of the rule. */
.epp-summary--pipeline .summary-body {
  position: relative;
  gap: 0;
  max-width: 60rem;
  padding: 0.5rem 0.75rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
}

.epp-summary--pipeline .summary-body::before {
  content: '';
  position: absolute;
  left: calc(0.75rem + 0.8125rem - 1px);
  top: 1.25rem;
  bottom: 1.25rem;
  width: 2px;
  background: var(--p-content-border-color);
}

.epp-summary--pipeline .summary-head {
  padding: 0;
  gap: 0.625rem;
}

.epp-summary--pipeline .summary-node,
.epp-summary--pipeline .step :deep(.epp-action-icon--tile),
.epp-summary--pipeline .summary-end :deep(.epp-action-icon--tile) {
  position: relative;
  z-index: 1;
  box-shadow: 0 0 0 3px var(--p-content-background);
}

.epp-summary--pipeline .summary-node--next {
  background: var(--p-content-background);
  border: 1px dashed var(--p-content-border-color);
}

.epp-summary--pipeline .clauses {
  padding: 0.25rem 0 0.5rem calc(1.625rem + 0.625rem);
}

.epp-summary--pipeline .steps {
  padding: 0.25rem 0;
}

.epp-summary--pipeline .summary-no-actions {
  padding: 0.25rem 0 0.25rem calc(1.625rem + 0.625rem);
}

.epp-summary--pipeline .summary-end {
  margin: 0.5rem 0 0;
  padding-top: 0;
  border-top: none;
}
</style>
