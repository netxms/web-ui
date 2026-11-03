import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import ServerActionDetailView from '../ServerActionDetailView.vue'

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

const updateAction = vi.fn()

vi.mock('@/queries/useServerActionQueries', async () => {
  const { ref } = await import('vue')
  return {
    useCreateServerAction: () => ({ mutate: vi.fn(), isPending: ref(false), error: ref(null) }),
    useUpdateServerAction: () => ({
      mutate: updateAction,
      isPending: ref(false),
      error: ref(null),
    }),
  }
})

// What GET /v1/notification-channels reports: SMTP needs both, the companion channel of a chat
// bot only a recipient (s_chatBotConfTemplate in notification_channel.cpp).
const channels = ref([
  { name: 'Email', driverName: 'SMTP', needSubject: true, needRecipient: true },
  {
    name: 'Ops bot',
    driverName: 'ChatBot',
    needSubject: false,
    needRecipient: true,
    providedByChatBot: true,
  },
  { name: 'Log file', driverName: 'TextFile', needSubject: false, needRecipient: false },
])

vi.mock('@/queries/useNotificationChannelQueries', () => ({
  useNotificationChannels: () => ({ data: channels }),
}))

vi.mock('@/queries/useEventForwarderQueries', async () => {
  const { ref } = await import('vue')
  return { useEventForwarders: () => ({ data: ref([]) }) }
})

function notification(overrides = {}) {
  return {
    id: 7,
    name: 'Notify',
    type: 3,
    isDisabled: false,
    data: 'Message',
    recipientAddress: 'ops@example.test',
    emailSubject: 'Alert',
    notificationChannelName: 'Email',
    ...overrides,
  }
}

function mountView(action) {
  return mount(ServerActionDetailView, {
    props: { action },
    global: {
      plugins: [PrimeVue],
      stubs: { MacroInputField: true, MacroTextareaField: true },
    },
  })
}

const labels = (wrapper) => wrapper.findAll('.form-field__label').map((l) => l.text())

beforeEach(() => {
  updateAction.mockClear()
})

describe('ServerActionDetailView notification fields', () => {
  it('shows recipient and subject for a channel that needs both', () => {
    const shown = labels(mountView(notification()))
    expect(shown).toContain("Recipient's address")
    expect(shown).toContain('Subject')
  })

  it('shows only the recipient for a chat bot channel', () => {
    const shown = labels(mountView(notification({ notificationChannelName: 'Ops bot' })))
    expect(shown).toContain("Recipient's address")
    expect(shown).not.toContain('Subject')
  })

  it('shows neither for a channel that needs neither', () => {
    const shown = labels(mountView(notification({ notificationChannelName: 'Log file' })))
    expect(shown).not.toContain("Recipient's address")
    expect(shown).not.toContain('Subject')
  })

  it('shows neither before a channel is picked', () => {
    const shown = labels(mountView(notification({ notificationChannelName: '' })))
    expect(shown).toContain('Channel name')
    expect(shown).not.toContain("Recipient's address")
    expect(shown).not.toContain('Subject')
  })

  it('shows both when the stored channel is not in the list', () => {
    const shown = labels(mountView(notification({ notificationChannelName: 'Deleted' })))
    expect(shown).toContain("Recipient's address")
    expect(shown).toContain('Subject')
  })

  it('keeps a hidden subject on save', async () => {
    const wrapper = mountView(notification({ notificationChannelName: 'Ops bot' }))
    await wrapper.find('input[placeholder="Action name"]').setValue('Notify ops')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save')
      .trigger('click')

    expect(updateAction).toHaveBeenCalledTimes(1)
    expect(updateAction.mock.calls[0][0].data).toMatchObject({
      name: 'Notify ops',
      emailSubject: 'Alert',
      recipientAddress: 'ops@example.test',
    })
  })
})
