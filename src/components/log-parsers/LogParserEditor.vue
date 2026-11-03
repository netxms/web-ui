<script setup>
import { reactive, ref, computed, watch, nextTick } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import LogParserRuleForm from './LogParserRuleForm.vue'
import { parseXml, serializeXml, createEmptyRule, duplicateRule } from '@/utils/logParserXml'
import FormField from '@/components/common/FormField.vue'
import DetailCard from '@/components/layout/DetailCard.vue'

const props = defineProps({
  initialContent: { type: String, required: true },
  parserType: { type: String, required: true },
})

const emit = defineEmits(['update:content'])

const model = reactive(parseXml(props.initialContent))

watch(model, () => emit('update:content', serializeXml(model)), { deep: true })

/** Value of `selected` for the "Parser settings" entry; anything else is a rule GUID. */
const SETTINGS = 'settings'

const selected = ref(model.rules[0]?.guid ?? SETTINGS)
const selectedIndex = computed(() => model.rules.findIndex((r) => r.guid === selected.value))

const listRef = ref(null)

async function select(key) {
  selected.value = key
  await nextTick()
  listRef.value?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' })
}

const processingNote = computed(() =>
  model.processAll ? 'All rules checked, Break stops' : 'Checked in order, first match stops',
)

const settingsSummary = computed(() => {
  const n = model.macros.length
  const macros = n === 0 ? 'no macros' : `${n} ${n === 1 ? 'macro' : 'macros'}`
  return `${model.name || 'Unnamed parser'}, ${macros}`
})

const RULE_FLAGS = [
  { key: 'matchInvert', icon: 'pi pi-filter-slash', label: 'Inverted match' },
  { key: 'absenceDetection', icon: 'pi pi-clock', label: 'Absence detection' },
  { key: 'breakOnMatch', icon: 'pi pi-stop-circle', label: 'Break' },
  { key: 'doNotSaveToDatabase', icon: 'pi pi-database', label: 'Not saved to database' },
]

function updateRule(i, updatedRule) {
  model.rules.splice(i, 1, updatedRule)
}

function addRule() {
  const rule = createEmptyRule()
  model.rules.push(rule)
  select(rule.guid)
}

function duplicateRuleAt(i) {
  const copy = duplicateRule(model.rules[i])
  model.rules.splice(i + 1, 0, copy)
  select(copy.guid)
}

function removeRule(i) {
  model.rules.splice(i, 1)
  const next = model.rules[i] ?? model.rules[i - 1]
  select(next ? next.guid : SETTINGS)
}

function moveRule(i, direction) {
  const j = i + direction
  if (j < 0 || j >= model.rules.length) return
  const temp = model.rules[i]
  model.rules[i] = model.rules[j]
  model.rules[j] = temp
  select(temp.guid)
}

function addMacro() {
  model.macros.push({ name: '', value: '' })
}

function removeMacro(i) {
  model.macros.splice(i, 1)
}
</script>

<template>
  <div class="log-parser-editor">
    <div ref="listRef" class="parser-list">
      <button
        type="button"
        class="list-row settings-row"
        :class="{ active: selected === SETTINGS }"
        :aria-current="selected === SETTINGS ? 'true' : undefined"
        @click="select(SETTINGS)"
      >
        <i class="pi pi-cog settings-icon" />
        <span class="row-body">
          <span class="row-title">Parser settings</span>
          <span class="row-detail">{{ settingsSummary }}</span>
        </span>
      </button>

      <div class="rules-head">
        <span class="rules-title">
          Rules <span class="rules-count">({{ model.rules.length }})</span>
        </span>
        <Button
          v-tooltip.bottom="'Add rule'"
          aria-label="Add rule"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          text
          rounded
          @click="addRule"
        />
      </div>
      <div class="rules-note">{{ processingNote }}</div>

      <div v-if="model.rules.length > 0" class="rule-rows">
        <button
          v-for="(rule, i) in model.rules"
          :key="rule.guid"
          type="button"
          class="list-row rule-row"
          :class="{ active: selected === rule.guid }"
          :aria-current="selected === rule.guid ? 'true' : undefined"
          @click="select(rule.guid)"
        >
          <span class="rule-index">{{ i + 1 }}</span>
          <span class="row-body">
            <span class="row-title-line">
              <span class="row-title" :class="{ unnamed: !rule.name }">
                {{ rule.name || 'Unnamed rule' }}
              </span>
              <span class="rule-flags">
                <i
                  v-for="flag in RULE_FLAGS.filter((f) => rule[f.key])"
                  :key="flag.key"
                  v-tooltip.top="flag.label"
                  :class="flag.icon"
                  role="img"
                  :aria-label="flag.label"
                />
              </span>
            </span>
            <span class="row-detail rule-detail">
              <span class="rule-pattern" :class="{ empty: !rule.match }">
                {{ rule.match || '(no pattern)' }}
              </span>
              <i class="pi pi-arrow-right rule-arrow" aria-hidden="true" />
              <span class="rule-event" :class="{ empty: !rule.event }">
                {{ rule.event || '(no event)' }}
              </span>
            </span>
          </span>
        </button>
      </div>
      <div v-else class="list-empty">No rules defined</div>
    </div>

    <div class="parser-detail">
      <LogParserRuleForm
        v-if="selectedIndex >= 0"
        :key="selected"
        :rule="model.rules[selectedIndex]"
        :parser-type="parserType"
        :index="selectedIndex"
        :count="model.rules.length"
        :process-all="model.processAll"
        @update:rule="updateRule(selectedIndex, $event)"
        @move-up="moveRule(selectedIndex, -1)"
        @move-down="moveRule(selectedIndex, 1)"
        @duplicate="duplicateRuleAt(selectedIndex)"
        @remove="removeRule(selectedIndex)"
      />

      <div v-else class="settings-form">
        <div class="detail-header">
          <h2 class="detail-title">Parser settings</h2>
        </div>
        <div class="detail-cards-grid">
          <DetailCard title="General" wide>
            <FormField class="detail-field" label="Name" v-slot="{ id }">
              <InputText :id="id" v-model="model.name" class="field-input" />
            </FormField>
            <FormField class="detail-field detail-field--check-top" label="Processing" group>
              <div class="field-input field-with-hint">
                <label class="checkbox-label">
                  <Checkbox v-model="model.processAll" binary />
                  <span>Always process all rules</span>
                </label>
                <small class="hint-text check-hint">
                  Off: rules are checked in order and processing stops at the first match. On: every
                  rule is checked, and processing stops only at a matching rule with Break set.
                </small>
              </div>
            </FormField>
          </DetailCard>

          <DetailCard :title="`Macros (${model.macros.length})`" wide>
            <div class="macros-body">
              <div class="macros-toolbar">
                <Button
                  icon="pi pi-plus"
                  label="Add macro"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="addMacro"
                />
                <span class="hint-text">
                  A named regular expression fragment. Patterns reference it as @{NAME}, and it is
                  substituted before matching.
                </span>
              </div>
              <div v-if="model.macros.length > 0" class="macros-table">
                <div class="macro-header">
                  <span class="macro-col-name">Name</span>
                  <span class="macro-col-value">Value</span>
                </div>
                <div v-for="(macro, i) in model.macros" :key="i" class="macro-row">
                  <InputText
                    v-model="macro.name"
                    class="macro-col-name mono"
                    aria-label="Macro name"
                    spellcheck="false"
                    autocomplete="off"
                  />
                  <InputText
                    v-model="macro.value"
                    class="macro-col-value mono"
                    aria-label="Macro value"
                    spellcheck="false"
                    autocomplete="off"
                  />
                  <Button
                    v-tooltip.top="'Remove macro'"
                    aria-label="Remove macro"
                    icon="pi pi-trash"
                    size="small"
                    text
                    severity="danger"
                    rounded
                    @click="removeMacro(i)"
                  />
                </div>
              </div>
            </div>
          </DetailCard>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-parser-editor {
  display: flex;
  height: 100%;
  min-height: 0;
}

.parser-list {
  width: 22rem;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0.375rem;
  border-right: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.list-row {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.625rem;
  border-radius: 0.25rem;
  transition: background-color 0.15s;
}

.list-row:hover {
  background: var(--p-surface-hover);
}

.list-row.active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.settings-icon {
  margin-top: 0.125rem;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.list-row.active .settings-icon {
  color: inherit;
}

.row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.row-title-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.row-title {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-title.unnamed {
  font-weight: 400;
  font-style: italic;
  color: var(--p-text-muted-color);
}

.row-detail {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rules-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  padding: 0.25rem 0.25rem 0 0.625rem;
  border-top: 1px solid var(--p-surface-border);
}

.rules-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.rules-count {
  font-weight: 400;
}

.rules-note {
  padding: 0 0.625rem 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.rule-rows {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.rule-index {
  min-width: 1.25rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.25rem;
  color: var(--p-text-muted-color);
  text-align: right;
}

.list-row.active .rule-index {
  color: inherit;
}

.rule-flags {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.list-row.active .rule-flags {
  color: inherit;
}

.rule-detail {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.rule-pattern,
.rule-event {
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-pattern {
  flex: 1 1 60%;
  min-width: 0;
}

.rule-event {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
}

.rule-pattern.empty,
.rule-event.empty {
  font-family: inherit;
  font-style: italic;
}

.rule-arrow {
  flex-shrink: 0;
  font-size: 0.625rem;
}

.list-empty {
  padding: 1.5rem 0.625rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  text-align: center;
}

.parser-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

.settings-form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 2.75rem;
  padding: 0.375rem 1.5rem;
  background: var(--p-surface-card);
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.detail-cards-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
}

.detail-field {
  display: flex;
  /* Explicit: the global .form-field in forms.css is column. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.detail-field:last-child {
  border-bottom: none;
}

.detail-field > :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  width: 8.5rem;
  flex-shrink: 0;
}

.detail-field--check-top {
  align-items: flex-start;
}

.field-input {
  flex: 1;
  min-width: 0;
}

.field-with-hint {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.check-hint {
  padding-left: 1.75rem;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.macros-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

.macros-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.macros-table {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.macro-header {
  display: flex;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.macro-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.macro-col-name {
  width: 14rem;
  flex-shrink: 0;
}

.macro-col-value {
  flex: 1;
  min-width: 0;
}

.macro-header .macro-col-value {
  margin-right: 2.5rem;
}
</style>
