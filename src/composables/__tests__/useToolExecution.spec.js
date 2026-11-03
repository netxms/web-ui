import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const expandText = vi.fn()
const executeObjectTool = vi.fn()
const toastAdd = vi.fn()
const confirmRequire = vi.fn()
const routerPush = vi.fn()

vi.mock('@/api/objectsApi', () => ({ expandText: (...args) => expandText(...args) }))

vi.mock('@/api/objectToolsApi', () => ({
  executeObjectTool: (...args) => executeObjectTool(...args),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

const { useToolExecution } = await import('@/composables/useToolExecution')

/** Real Pinia: the composable reaches the execution store for tools that produce output. */
function mountHost() {
  let api
  const Host = defineComponent({
    setup() {
      api = useToolExecution()
      return () => h('div')
    },
  })
  mount(Host)
  return api
}

const NODE = { id: 512, name: 'core-sw-01' }

beforeEach(() => {
  setActivePinia(createPinia())
  expandText.mockReset()
  executeObjectTool.mockReset()
  toastAdd.mockReset()
  confirmRequire.mockReset()
  routerPush.mockReset()
  vi.stubGlobal('open', vi.fn())
})

describe('useToolExecution - command tools', () => {
  const sshTool = { id: 7, name: 'SSH', type: 'command', data: 'ssh://%U@%a' }

  it('opens the server-expanded command, not the raw text', async () => {
    expandText.mockResolvedValue('ssh://admin@10.0.0.5')
    await mountHost().executeTool(NODE, sshTool)

    expect(expandText).toHaveBeenCalledWith(512, 'ssh://%U@%a', { inputFields: {} })
    expect(window.open).toHaveBeenCalledWith(
      'ssh://admin@10.0.0.5',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('forwards input field values so %(name) macros can expand', async () => {
    expandText.mockResolvedValue('ssh://admin@10.0.0.5')
    await mountHost().executeTool(NODE, sshTool, { user: 'admin' })
    expect(expandText).toHaveBeenCalledWith(512, 'ssh://%U@%a', {
      inputFields: { user: 'admin' },
    })
  })

  it('opens nothing when expansion fails, rather than falling back to the raw URI', async () => {
    expandText.mockRejectedValue(new Error('403'))
    await mountHost().executeTool(NODE, sshTool)

    expect(window.open).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Cannot expand command' }),
    )
  })

  it('still blocks an unsafe scheme after expansion', async () => {
    expandText.mockResolvedValue('javascript:alert(1)')
    await mountHost().executeTool(NODE, { ...sshTool, data: '%{evil}' })

    expect(window.open).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Blocked unsafe command' }),
    )
  })

  it('does nothing for a command tool with no data, without calling the server', async () => {
    await mountHost().executeTool(NODE, { ...sshTool, data: '' })
    expect(expandText).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })
})

describe('useToolExecution - confirmation', () => {
  const tool = {
    id: 9,
    name: 'Restart agent',
    type: 'action',
    askConfirmation: true,
    confirmationMessage: 'Restart the agent on %n?',
  }

  it('shows the expanded confirmation message', async () => {
    expandText.mockResolvedValue('Restart the agent on core-sw-01?')
    confirmRequire.mockImplementation(({ reject }) => reject())

    await mountHost().executeTool(NODE, tool)

    expect(confirmRequire).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Restart the agent on core-sw-01?' }),
    )
    expect(executeObjectTool).not.toHaveBeenCalled()
  })

  it('falls back to the raw message when expansion fails, so the tool stays usable', async () => {
    expandText.mockRejectedValue(new Error('offline'))
    confirmRequire.mockImplementation(({ reject }) => reject())

    await mountHost().executeTool(NODE, tool)

    expect(confirmRequire).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Restart the agent on %n?' }),
    )
  })

  it('cancels the tool when the dialog is dismissed without a choice', async () => {
    expandText.mockResolvedValue('Restart?')
    confirmRequire.mockImplementation(({ onHide }) => onHide())

    const result = await mountHost().executeTool(NODE, tool)

    expect(result).toBeNull()
    expect(executeObjectTool).not.toHaveBeenCalled()
  })
})
