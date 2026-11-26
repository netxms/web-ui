import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import PrimeVue from 'primevue/config'
import InputNumber from 'primevue/inputnumber'
import DciProcessingTab from '../DciProcessingTab.vue'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

const components = ref([])
vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({ has: (id) => components.value.includes(id) }),
}))

vi.mock('@/queries/useObjectQueries', async () => {
  const { computed } = await import('vue')
  return { useObjectsByIds: () => ({ objectsById: computed(() => new Map()) }) }
})

const stubs = { NxslScriptEditor: true, EventSelectField: true, DciThresholdDialog: true }

function anomalyDetection(overrides = {}) {
  return {
    sensitivity: 3.5,
    direction: 'both',
    mode: 'auto',
    minTrainingDays: 7,
    provider: { id: 'slot' },
    detector: { id: 'cusum', k: 1, h: 5 },
    enabled: true,
    llmTuning: false,
    ...overrides,
  }
}

function dciForm(overrides = {}) {
  return reactive({
    type: 'item',
    flags: 0x1,
    retentionType: 'default',
    retentionTime: '',
    sampleSaveInterval: 1,
    thresholds: [],
    anomalyDetection: anomalyDetection(),
    ...overrides,
  })
}

function mountTab(form, saved = null) {
  return mount(DciProcessingTab, {
    props: { form, saved, objectId: 100 },
    global: { plugins: [PrimeVue], stubs },
  })
}

const labels = (wrapper) => wrapper.findAll('label, .form-field__label').map((l) => l.text())

function hardBoundInput(wrapper, side) {
  const label = side === 'min' ? 'Hard bound minimum' : 'Hard bound maximum'
  return wrapper.findAllComponents(InputNumber).find((c) => c.props('ariaLabel') === label)
}

beforeEach(() => {
  components.value = []
})

describe('DciProcessingTab anomaly detection', () => {
  it('edits the settings in their own panel, without the old flag checkboxes', () => {
    const wrapper = mountTab(dciForm())
    const text = labels(wrapper)
    expect(text).toContain('Detect anomalies')
    expect(text).toEqual(
      expect.arrayContaining([
        'Sensitivity',
        'Report Deviations',
        'Analyze',
        'Training Days',
        'Hard Bounds',
      ]),
    )
    expect(wrapper.text()).not.toContain('isolation forest')
    expect(wrapper.text()).not.toContain('Detect anomalies using AI')
  })

  it('offers AI tuning only with the assistant, or while it is on', () => {
    expect(labels(mountTab(dciForm()))).not.toContain('Tune settings using AI')

    components.value = ['AI-ASSISTANT']
    expect(labels(mountTab(dciForm()))).toContain('Tune settings using AI')

    components.value = []
    const saved = { anomalyDetection: anomalyDetection({ llmTuning: true }) }
    expect(labels(mountTab(dciForm(), saved))).toContain('Tune settings using AI')
  })

  it('turns AI tuning off with detection', async () => {
    components.value = ['AI-ASSISTANT']
    const form = dciForm({ anomalyDetection: anomalyDetection({ llmTuning: true }) })
    const wrapper = mountTab(form)
    await wrapper.find('#anomaly-enabled').setValue(false)
    expect(form.anomalyDetection.enabled).toBe(false)
    expect(form.anomalyDetection.llmTuning).toBe(false)
  })

  it('leaves never-set hard bounds out of the form, and clears saved ones with null', async () => {
    const fresh = dciForm()
    const wrapper = mountTab(fresh)
    hardBoundInput(wrapper, 'max').vm.$emit('update:modelValue', 95)
    expect(fresh.anomalyDetection.hardBounds).toEqual({ max: 95 })
    hardBoundInput(wrapper, 'max').vm.$emit('update:modelValue', null)
    expect('hardBounds' in fresh.anomalyDetection).toBe(false)

    const saved = { anomalyDetection: anomalyDetection({ hardBounds: { min: 0, max: 100 } }) }
    const form = dciForm({ anomalyDetection: anomalyDetection({ hardBounds: { min: 0, max: 100 } }) })
    const edited = mountTab(form, saved)
    hardBoundInput(edited, 'min').vm.$emit('update:modelValue', null)
    expect(form.anomalyDetection.hardBounds).toEqual({ max: 100 })
    hardBoundInput(edited, 'max').vm.$emit('update:modelValue', null)
    expect(form.anomalyDetection.hardBounds).toBeNull()
  })

  it('warns when storage settings keep the model from learning', () => {
    const wrapper = mountTab(dciForm({ retentionType: 'none' }))
    expect(wrapper.text()).toContain('Collected values are not stored')

    const off = mountTab(
      dciForm({ retentionType: 'none', anomalyDetection: anomalyDetection({ enabled: false }) }),
    )
    expect(off.text()).not.toContain('Collected values are not stored')
  })

  it('shows the state of the saved model', () => {
    const saved = {
      anomalyDetection: anomalyDetection({ model: { learning: true, trainingDays: 3 } }),
    }
    const wrapper = mountTab(dciForm(), saved)
    expect(wrapper.text()).toContain('Learning: 3 of 7 days collected')
  })

  it('keeps only the enable flag on a server without anomaly settings', async () => {
    const form = dciForm({ flags: 0x40000, anomalyDetection: undefined })
    delete form.anomalyDetection
    const wrapper = mountTab(form)
    expect(wrapper.text()).toContain('need a newer server')
    expect(labels(wrapper)).not.toContain('Sensitivity')
    await wrapper.find('#anomaly-enabled').setValue(true)
    expect(form.flags).toBe(0x40001)
  })

  it('has no panel for a table DCI', () => {
    const wrapper = mount(DciProcessingTab, {
      props: { form: dciForm({ type: 'table' }), dciType: 'table', objectId: 100 },
      global: { plugins: [PrimeVue], stubs },
    })
    expect(wrapper.text()).not.toContain('Anomaly Detection')
  })
})
