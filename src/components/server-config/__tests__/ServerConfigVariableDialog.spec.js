import { afterEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ServerConfigVariableDialog from '@/components/server-config/ServerConfigVariableDialog.vue'
import { SECRET_PLACEHOLDER } from '@/utils/serverConfigDisplay'

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

function variable(overrides = {}) {
  return {
    id: 'Jira.Password',
    name: 'Jira.Password',
    value: '',
    defaultValue: '',
    dataType: 'PASSWORD',
    description: '',
    units: '',
    needServerRestart: false,
    possibleValues: [],
    ...overrides,
  }
}

async function mountDialog(props) {
  const wrapper = mount(ServerConfigVariableDialog, {
    props: { visible: true, ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue] },
  })
  // PrimeVue's Dialog mounts its teleported content a tick after the wrapper exists.
  await wrapper.vm.$nextTick()
  return wrapper
}

const secretInput = () => document.querySelector('input[type="password"]')
const revealToggle = () => document.querySelector('[data-pc-section="unmaskicon"]')
const SECRET_HINT = 'The current secret is not shown'

async function typeSecret(wrapper, text) {
  const input = secretInput()
  input.value = text
  input.dispatchEvent(new Event('input'))
  await wrapper.vm.$nextTick()
}

function clickSave() {
  ;[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Save')).click()
}

describe('ServerConfigVariableDialog secret variables', () => {
  // Teleported dialog content outlives the wrapper.
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('offers no reveal while the field holds the placeholder, and explains it', async () => {
    await mountDialog({ variable: variable({ value: SECRET_PLACEHOLDER }) })
    expect(secretInput().value).toBe(SECRET_PLACEHOLDER)
    expect(revealToggle()).toBeNull()
    expect(document.body.textContent).toContain(SECRET_HINT)
  })

  it('offers the reveal once a new secret is typed, and keeps the hint', async () => {
    const wrapper = await mountDialog({ variable: variable({ value: SECRET_PLACEHOLDER }) })
    await typeSecret(wrapper, 'new-secret')
    expect(revealToggle()).not.toBeNull()
    expect(document.body.textContent).toContain(SECRET_HINT)
  })

  it('has no hint for a secret that is not set', async () => {
    await mountDialog({ variable: variable({ value: '' }) })
    expect(revealToggle()).not.toBeNull()
    expect(document.body.textContent).not.toContain(SECRET_HINT)
  })

  it('sends the placeholder back unchanged, which keeps the secret', async () => {
    const wrapper = await mountDialog({ variable: variable({ value: SECRET_PLACEHOLDER }) })
    clickSave()
    expect(wrapper.emitted('save')).toEqual([
      [{ name: 'Jira.Password', value: SECRET_PLACEHOLDER }],
    ])
  })

  it('sends an emptied field as "", which removes the secret', async () => {
    const wrapper = await mountDialog({ variable: variable({ value: SECRET_PLACEHOLDER }) })
    await typeSecret(wrapper, '')
    clickSave()
    expect(wrapper.emitted('save')).toEqual([[{ name: 'Jira.Password', value: '' }]])
  })
})

describe('ServerConfigVariableDialog choice variables', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists integer choices in numeric order', async () => {
    const shift = variable({
      name: 'Objects.StatusCalculation.Shift',
      dataType: 'CHOICE',
      value: '0',
      defaultValue: '0',
      possibleValues: ['-1', '-2', '0', '2', '1'].map((value) => ({
        value,
        description: `Shift ${value}`,
      })),
    })
    const wrapper = await mountDialog({ variable: shift })
    const select = wrapper.findComponent({ name: 'Select' })
    expect(select.props('options').map((o) => o.value)).toEqual(['-2', '-1', '0', '1', '2'])
  })
})
