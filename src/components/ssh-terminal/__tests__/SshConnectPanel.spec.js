import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import PrimeVue from 'primevue/config'

const sshKeys = vi.hoisted(() => ({ data: null }))
vi.mock('@/queries/useSshKeyQueries', () => ({
  useSshKeys: () => ({ data: sshKeys.data }),
}))

const { default: SshConnectPanel } = await import('@/components/ssh-terminal/SshConnectPanel.vue')

const NODE = {
  id: 42,
  name: 'sw-core',
  sshLogin: 'admin',
  sshPort: 2222,
  effectiveRights: { modify: true, readCredentials: true },
}
const NODE_WITHOUT_LOGIN = { ...NODE, sshLogin: '' }
const NODE_LOGIN_HIDDEN = {
  ...NODE,
  sshLogin: '',
  effectiveRights: { modify: false, readCredentials: false },
}

function render(props) {
  return mount(SshConnectPanel, {
    props: { object: NODE, message: null, remembered: null, active: true, ...props },
    global: {
      plugins: [PrimeVue],
      stubs: { Select: true },
      directives: { tooltip: {} },
    },
  })
}

const loginField = (wrapper) => wrapper.find('input[data-testid="ssh-login"]')
const passwordField = (wrapper) => wrapper.find('input[type="password"]')

describe('SshConnectPanel', () => {
  beforeEach(() => {
    sshKeys.data = ref([])
  })

  describe('with credentials stored on the node', () => {
    it('offers them first and names the login, with no fields to fill in', () => {
      const wrapper = render()
      expect(wrapper.text()).toContain('admin')
      expect(loginField(wrapper).exists()).toBe(false)
      expect(passwordField(wrapper).exists()).toBe(false)
    })

    it('submits a request for the stored credentials, not their values', async () => {
      const wrapper = render()
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('connect')[0][0]).toEqual({ mode: 'stored' })
    })
  })

  describe('with no credentials stored', () => {
    it('offers only the form, since there is nothing stored to choose', () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      expect(wrapper.text()).not.toContain('Stored credentials')
      expect(loginField(wrapper).exists()).toBe(true)
      expect(passwordField(wrapper).exists()).toBe(true)
    })

    it('will not connect without a login, and says why', async () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('connect')).toBeUndefined()
      expect(wrapper.text()).toContain('Enter a login')
    })

    it('submits what was typed', async () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      await loginField(wrapper).setValue('  operator ')
      await passwordField(wrapper).setValue('s3cret')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('connect')[0][0]).toEqual({
        mode: 'custom',
        login: 'operator',
        password: 's3cret',
        keyId: 0,
      })
    })
  })

  describe('when the server hides the stored login from this user', () => {
    it('still offers the stored credentials, without naming them', () => {
      const wrapper = render({ object: NODE_LOGIN_HIDDEN })
      expect(wrapper.text()).toContain('Stored credentials')
      expect(wrapper.text()).toContain('credentials stored on the node')
    })
  })

  describe('remembering the last choice', () => {
    it('starts on the form with the last login, and never a password', () => {
      const wrapper = render({
        remembered: { objectId: 42, mode: 'custom', login: 'operator', keyId: 0 },
      })
      expect(loginField(wrapper).element.value).toBe('operator')
      expect(passwordField(wrapper).element.value).toBe('')
    })

    it('ignores a remembered choice of stored credentials the node no longer has', () => {
      const wrapper = render({
        object: NODE_WITHOUT_LOGIN,
        remembered: { objectId: 42, mode: 'stored', login: '', keyId: 0 },
      })
      expect(loginField(wrapper).exists()).toBe(true)
    })
  })

  describe('fields that do nothing are not shown', () => {
    it('shows the port as text, because this connection cannot change it', () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      expect(wrapper.text()).toContain('2222')
      expect(wrapper.findAll('input').map((input) => input.attributes('value'))).not.toContain(
        '2222',
      )
    })

    it('offers an SSH key only when the server has some', async () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      expect(wrapper.text()).not.toContain('SSH key')

      sshKeys.data = ref([{ id: 5, name: 'ops' }])
      const withKeys = render({ object: NODE_WITHOUT_LOGIN })
      expect(withKeys.text()).toContain('SSH key')
    })
  })

  describe('after a failed attempt', () => {
    it('shows the reason and keeps what was typed', async () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      await loginField(wrapper).setValue('operator')
      await passwordField(wrapper).setValue('wrong')
      await wrapper.setProps({ active: false })

      await wrapper.setProps({
        active: true,
        message: { severity: 'error', title: 'Could not connect or log in', detail: 'Agent said' },
      })
      await nextTick()

      expect(wrapper.text()).toContain('Could not connect or log in')
      expect(loginField(wrapper).element.value).toBe('operator')
      expect(passwordField(wrapper).element.value).toBe('wrong')
    })
  })

  describe('while a login is being tried', () => {
    it('shows it on the button and will not start a second one', async () => {
      const wrapper = render({ connecting: true })
      expect(wrapper.text()).toContain('Connecting')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('connect')).toBeUndefined()
    })

    it('offers a way out', async () => {
      const wrapper = render({ connecting: true })
      const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancel')
      await cancel.trigger('click')
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('locks what was typed, and keeps it', async () => {
      const wrapper = render({ object: NODE_WITHOUT_LOGIN })
      await loginField(wrapper).setValue('operator')
      await wrapper.setProps({ connecting: true })
      expect(loginField(wrapper).element.disabled).toBe(true)
      expect(loginField(wrapper).element.value).toBe('operator')
    })

    it('offers no Cancel when nothing is being tried', () => {
      const wrapper = render()
      expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Cancel')
    })
  })

  it('forgets the typed password on request, once the session is up', async () => {
    const wrapper = render({ object: NODE_WITHOUT_LOGIN })
    await passwordField(wrapper).setValue('s3cret')
    wrapper.vm.forgetPassword()
    await nextTick()
    expect(passwordField(wrapper).element.value).toBe('')
  })
})
