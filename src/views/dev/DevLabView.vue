<script setup>
/* Dev-only UI lab (/dev-lab): shared UI treatments on real components, across every theme. */
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { useTheme } from '@/composables/useTheme'
import {
  UI_FONTS,
  MONO_FONTS,
  FONT_SIZES,
  normalizeFamily,
  fontStack,
  loadFont,
  readTypography,
  saveTypography,
  applyTypography,
  shippedValue,
} from '@/utils/devFontLab'
import CreateNodeDialog from '@/components/objects/CreateNodeDialog.vue'
import FormField from '@/components/common/FormField.vue'

const { colorTheme, setColorTheme, THEMES, themeIcon, toggleTheme, themeLabel, isRtl, toggleRtl } =
  useTheme()

const SHIPPED_LABEL = 'Shipped stack (current)'
const SIZE_OPTIONS = FONT_SIZES.map((size) => ({ label: `${size}px`, value: size }))
const COMPARE_OPTIONS = [
  { label: 'UI fonts', value: 'ui' },
  { label: 'Mono fonts', value: 'mono' },
]
const EXTRA_KEY = { ui: 'extraUi', mono: 'extraMono' }

// The Latvian and Russian pangrams (escaped to keep the source ASCII) show whether a face
// covers both scripts.
const SPECIMEN_ROWS = [
  { node: 'db-primary.dc1', cpu: '93.4', traffic: '1,204.77' },
  { node: 'edge-rtr-02', cpu: '7.1', traffic: '88.05' },
  { node: 'lb-west', cpu: '41.0', traffic: '512.00' },
]
const SPECIMEN_LV =
  'Gl\u0101\u017e\u0161\u0137\u016b\u0146a r\u016b\u0137\u012b\u0161i dz\u0113rum\u0101 \u010diepj Baha koncertfl\u012b\u0123e\u013cu v\u0101kus'
const SPECIMEN_RU =
  '\u0421\u044a\u0435\u0448\u044c \u0436\u0435 \u0435\u0449\u0451 \u044d\u0442\u0438\u0445 \u043c\u044f\u0433\u043a\u0438\u0445 \u0444\u0440\u0430\u043d\u0446\u0443\u0437\u0441\u043a\u0438\u0445 \u0431\u0443\u043b\u043e\u043a, \u0434\u0430 \u0432\u044b\u043f\u0435\u0439 \u0447\u0430\u044e'
const MONO_SPECIMEN = [
  'if ($node->isAgent && $1 > 90.0)',
  '    return "CPU at " .. $1 .. "%";',
  '00:1A:2B:3C:4D:5E  fe80::1c2a:3bff:fe4d:5e01',
  '.1.3.6.1.2.1.2.2.1.10.3  Il1| O0 {}[] => != ->',
  '2026-10-23 18:04:11.237 [poll] node 168 status 2 -> 0',
].join('\n')

// The values without the override, for the "Shipped stack" entries and the default size.
const shipped = {
  ui: shippedValue('ui'),
  mono: shippedValue('mono'),
  size: parseInt(shippedValue('size'), 10) || 14,
}

const typography = ref(readTypography())
/** family -> 'loading' | 'ready' | 'failed' */
const fontStatus = ref({})
const compareKind = ref('ui')
const familyInput = ref('')

const families = computed(() => ({
  ui: [...UI_FONTS, ...typography.value.extraUi],
  mono: [...MONO_FONTS, ...typography.value.extraMono],
}))

function fontOptions(kind) {
  return [
    { label: SHIPPED_LABEL, value: null },
    ...families.value[kind].map((family) => ({ label: family, value: family })),
  ]
}
const uiOptions = computed(() => fontOptions('ui'))
const monoOptions = computed(() => fontOptions('mono'))

const isOverridden = computed(() => {
  const { ui, mono, size } = typography.value
  return Boolean(ui || mono || size)
})
const familyValid = computed(() => Boolean(normalizeFamily(familyInput.value)))

/** The font-family value for a family; null is the shipped stack. */
function stackFor(family, kind) {
  return family ? fontStack(family, kind) : shipped[kind]
}

function updateTypography(patch) {
  typography.value = { ...typography.value, ...patch }
  applyTypography(typography.value)
  saveTypography(typography.value)
}

function setSize(size) {
  updateTypography({ size: size === shipped.size ? null : size })
}

function resetTypography() {
  updateTypography({ ui: null, mono: null, size: null })
}

function ensureLoaded(family) {
  if (fontStatus.value[family]) return
  fontStatus.value[family] = 'loading'
  loadFont(family).then((ok) => {
    fontStatus.value[family] = ok ? 'ready' : 'failed'
  })
}

watch(families, (lists) => [...lists.ui, ...lists.mono].forEach(ensureLoaded), {
  immediate: true,
})

function addFamily(kind) {
  const family = normalizeFamily(familyInput.value)
  if (!family) return
  const key = EXTRA_KEY[kind]
  const patch = { [kind]: family }
  if (!families.value[kind].includes(family)) {
    patch[key] = [...typography.value[key], family]
  }
  updateTypography(patch)
  compareKind.value = kind
  familyInput.value = ''
}

function removeFamily(kind, family) {
  const key = EXTRA_KEY[kind]
  const patch = { [key]: typography.value[key].filter((f) => f !== family) }
  if (typography.value[kind] === family) patch[kind] = null
  updateTypography(patch)
}

const compareCards = computed(() => {
  const kind = compareKind.value
  return [null, ...families.value[kind]].map((family) => ({
    family,
    kind,
    label: family ?? SHIPPED_LABEL,
    stack: stackFor(family, kind),
    status: family ? fontStatus.value[family] : 'ready',
    active: typography.value[kind] === family,
    removable: typography.value[EXTRA_KEY[kind]].includes(family),
  }))
})

const nodeDialogVisible = ref(false)
const sampleDialogVisible = ref(false)

// Stub parent so CreateNodeDialog renders.
const stubParent = { id: 1, name: 'Demo Container' }
</script>

<template>
  <div class="dev-lab">
    <header class="lab-head">
      <h1>Dev Lab</h1>
      <p class="lab-sub">Scratch page for trying shared UI treatments. Dev builds only.</p>
    </header>

    <section class="lab-section">
      <h2 class="lab-section-title">Theme</h2>

      <div class="lab-controls">
        <div class="control-group">
          <span class="control-label">Color theme</span>
          <div class="swatches">
            <button
              v-for="t in THEMES"
              :key="t.id"
              class="swatch"
              :class="{ 'is-active': colorTheme === t.id }"
              :style="{ '--swatch-color': t.swatch, '--swatch-ring': t.palette[500] }"
              :title="t.label"
              @click="setColorTheme(t.id)"
            />
          </div>
        </div>

        <div class="control-group">
          <span class="control-label">Mode</span>
          <Button
            :label="themeLabel"
            :icon="themeIcon"
            severity="secondary"
            outlined
            size="small"
            @click="toggleTheme"
          />
        </div>

        <div class="control-group">
          <span class="control-label">Layout direction</span>
          <ToggleSwitch
            :model-value="isRtl"
            aria-label="Right-to-left layout"
            @update:model-value="toggleRtl"
          />
        </div>
      </div>
    </section>

    <section class="lab-section">
      <h2 class="lab-section-title">Typography</h2>

      <div class="lab-controls">
        <div class="control-group">
          <span class="control-label">UI font</span>
          <Select
            :model-value="typography.ui"
            :options="uiOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="font-select"
            aria-label="UI font"
            @update:model-value="updateTypography({ ui: $event })"
          >
            <template #option="{ option }">
              <span :style="{ fontFamily: stackFor(option.value, 'ui') }">{{ option.label }}</span>
            </template>
          </Select>
        </div>

        <div class="control-group">
          <span class="control-label">Mono font</span>
          <Select
            :model-value="typography.mono"
            :options="monoOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="font-select"
            aria-label="Mono font"
            @update:model-value="updateTypography({ mono: $event })"
          >
            <template #option="{ option }">
              <span :style="{ fontFamily: stackFor(option.value, 'mono') }">
                {{ option.label }}
              </span>
            </template>
          </Select>
        </div>

        <div class="control-group">
          <span class="control-label">Base size</span>
          <SelectButton
            :model-value="typography.size ?? shipped.size"
            :options="SIZE_OPTIONS"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            aria-label="Base font size"
            @update:model-value="setSize"
          />
        </div>

        <div class="control-group">
          <span class="control-label">Any Google Fonts family</span>
          <div class="family-add">
            <InputText
              v-model="familyInput"
              size="small"
              placeholder="e.g. Rubik"
              aria-label="Google Fonts family name"
              @keydown.enter="addFamily('ui')"
            />
            <Button
              label="Add as UI"
              size="small"
              severity="secondary"
              outlined
              :disabled="!familyValid"
              @click="addFamily('ui')"
            />
            <Button
              label="Add as mono"
              size="small"
              severity="secondary"
              outlined
              :disabled="!familyValid"
              @click="addFamily('mono')"
            />
          </div>
        </div>

        <div class="control-group control-group--end">
          <Button
            label="Reset"
            icon="pi pi-refresh"
            text
            severity="secondary"
            size="small"
            :disabled="!isOverridden"
            @click="resetTypography"
          />
        </div>
      </div>

      <p class="lab-note">
        Applies to the whole app and survives reloads in this browser. Network maps pick up a new
        font when they load. Fonts come from Google Fonts in dev only; the one chosen ships
        self-hosted.
      </p>

      <SelectButton
        v-model="compareKind"
        :options="COMPARE_OPTIONS"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        class="compare-switch"
        aria-label="Fonts to compare"
      />

      <div class="font-grid">
        <article
          v-for="card in compareCards"
          :key="card.label"
          class="font-card"
          :class="{ 'is-active': card.active }"
        >
          <header class="font-card-head">
            <span class="font-card-name">{{ card.label }}</span>
            <span v-if="card.status === 'loading'" class="font-card-status">Loading</span>
            <span v-else-if="card.status === 'failed'" class="font-card-status">
              Not on Google Fonts
            </span>
            <Button
              v-if="card.removable"
              icon="pi pi-times"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="`Remove ${card.label}`"
              @click="removeFamily(card.kind, card.family)"
            />
            <Button
              :label="card.active ? 'In use' : 'Use'"
              size="small"
              :outlined="!card.active"
              :disabled="card.active"
              @click="updateTypography({ [card.kind]: card.family })"
            />
          </header>

          <div class="font-specimen" :style="{ fontFamily: card.stack }">
            <template v-if="card.kind === 'ui'">
              <div class="spec-title">Infrastructure overview</div>
              <div class="spec-alarm">
                <span class="spec-sev">Critical</span>
                <span class="spec-source">core-sw-01.dc1</span>
                <span>Interface "Gi0/1" changed state to DOWN</span>
                <span class="spec-muted">41s ago</span>
              </div>
              <table class="spec-table">
                <thead>
                  <tr>
                    <th>Node</th>
                    <th class="num">CPU %</th>
                    <th class="num">In, Mbps</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in SPECIMEN_ROWS" :key="row.node">
                    <td>{{ row.node }}</td>
                    <td class="num">{{ row.cpu }}</td>
                    <td class="num">{{ row.traffic }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="spec-weights">
                <span class="w-400">Regular</span>
                <span class="w-500">Medium</span>
                <span class="w-600">Semibold</span>
                <span class="w-700">Bold</span>
              </div>
              <div>Il1| O0 rn m 5S 8B 10.2.1.168</div>
              <div lang="lv">{{ SPECIMEN_LV }}</div>
              <div lang="ru">{{ SPECIMEN_RU }}</div>
            </template>
            <pre v-else class="mono-specimen">{{ MONO_SPECIMEN }}</pre>
          </div>
        </article>
      </div>
    </section>

    <section class="lab-section">
      <h2 class="lab-section-title">Dialogs</h2>

      <div class="lab-actions">
        <Button
          label="Open form dialog (Create Node)"
          icon="pi pi-plus"
          @click="nodeDialogVisible = true"
        />
        <Button
          label="Open simple dialog"
          icon="pi pi-window-maximize"
          severity="secondary"
          @click="sampleDialogVisible = true"
        />
      </div>
    </section>

    <CreateNodeDialog v-model:visible="nodeDialogVisible" :parent-object="stubParent" />

    <Dialog
      v-model:visible="sampleDialogVisible"
      header="Edit Settings"
      :modal="true"
      :style="{ width: '420px' }"
    >
      <div class="sample-form">
        <FormField class="sample-row" label="Display name" v-slot="{ id }">
          <InputText :id="id" size="small" model-value="Sample value" />
        </FormField>
        <FormField class="sample-row" label="Description" v-slot="{ id }">
          <InputText :id="id" size="small" model-value="A short description" />
        </FormField>
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="sampleDialogVisible = false" />
        <Button label="Save" icon="pi pi-check" @click="sampleDialogVisible = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.dev-lab {
  padding: 2rem;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.lab-head h1 {
  margin: 0 0 0.25rem;
  font-size: 1.375rem;
}

.lab-sub {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.lab-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lab-section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.lab-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.swatches {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  height: 100%;
}

.swatch {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  background: var(--swatch-color);
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s;
}

.swatch:hover {
  transform: scale(1.15);
}

.swatch.is-active {
  box-shadow:
    0 0 0 2px var(--p-surface-card),
    0 0 0 4px var(--swatch-ring);
}

.lab-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.font-select {
  min-width: 14rem;
}

.family-add {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.control-group--end {
  margin-inline-start: auto;
  justify-content: flex-end;
}

.lab-note {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.compare-switch {
  align-self: flex-start;
}

.font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
  gap: 1rem;
}

.font-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
}

.font-card.is-active {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 1px var(--p-primary-color);
}

.font-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.font-card-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
}

.font-card-status {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.font-specimen {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  overflow-wrap: anywhere;
}

.spec-title {
  font-size: 1.25em;
  font-weight: 600;
}

.spec-alarm {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.spec-sev {
  padding: 0.0625rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.85em;
  font-weight: 600;
  background: var(--netxms-status-critical-bg);
  color: var(--netxms-status-critical-text);
}

.spec-source {
  font-weight: 600;
}

.spec-muted {
  font-size: 0.85em;
  color: var(--p-text-muted-color);
}

.spec-table {
  width: 100%;
  border-collapse: collapse;
}

.spec-table th,
.spec-table td {
  padding: 0.25rem 0.5rem;
  text-align: start;
  border-bottom: 1px solid var(--p-surface-border);
}

.spec-table th {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

/* Numeric columns use tabular figures, as the console's own numeric columns do. */
.spec-table .num {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.spec-weights {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.w-400 {
  font-weight: 400;
}

.w-500 {
  font-weight: 500;
}

.w-600 {
  font-weight: 600;
}

.w-700 {
  font-weight: 700;
}

/* <pre> defaults to the browser's monospace; inherit the card's candidate instead. */
.mono-specimen {
  margin: 0;
  font-family: inherit;
  font-size: 0.8125rem;
  white-space: pre-wrap;
}

.sample-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.sample-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sample-row label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}
</style>
