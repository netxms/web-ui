import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  run,
  sendMessage,
  notifyNotImplemented,
  dciId,
  serverOptions,
  aiAvailable,
  isAiChatOpen,
  objectMenuItems,
  menuObjectId,
  MenuStub,
  mountTable,
  select,
  openMenu,
  labels,
  item,
  resetHarness,
} from './alarmTableHarness'

beforeEach(resetHarness)

describe('AlarmTable menu on one alarm', () => {
  it('mirrors the legacy list, leaving out what does not apply', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 0)

    expect(labels(items)).toEqual([
      'Acknowledge',
      'Sticky acknowledge',
      'Resolve',
      'Terminate',
      'Go to Object',
      'Copy to clipboard',
      'Copy message to clipboard',
      'Export to CSV',
      'Details',
      'Create incident',
      'Object',
    ])
  })

  it('offers no acknowledge on an acknowledged alarm', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 2)

    expect(labels(items)).not.toContain('Acknowledge')
    expect(labels(items)).not.toContain('Sticky acknowledge')
  })

  it('acts on that alarm alone', async () => {
    const wrapper = mountTable()

    const items = await openMenu(wrapper, 1)
    await item(items, 'alarm.resolve').command()
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'resolve', ids: [2] }))
  })

  it('leaves the selection alone when opened outside it', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 2)

    expect(labels(items)).toContain('Details')
    expect(wrapper.find('.selection-actions').text()).toContain('2 selected')
  })

  it('offers Go to DCI only for an alarm that has one', async () => {
    const wrapper = mountTable()
    expect(labels(await openMenu(wrapper, 0))).not.toContain('Go to DCI')

    dciId.value = 77
    await nextTick()
    const items = wrapper.findComponent(MenuStub).props('items')

    expect(labels(items)).toContain('Go to DCI')
    expect(item(items, 'alarm.goToDci').url).toBe('/resolved')
  })

  it('gives Go to Object a real link, for a new tab', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.goToObject').url).toBe('/resolved')
  })

  it('hides Go to Object for the object being viewed, not for its children', async () => {
    const wrapper = mountTable({ ownerObjectId: 11 })

    expect(labels(await openMenu(wrapper, 0))).not.toContain('Go to Object')
    expect(labels(await openMenu(wrapper, 1))).toContain('Go to Object')
  })

  it('shows sticky acknowledge as not yet available', async () => {
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.stickyAcknowledge').command()

    expect(notifyNotImplemented).toHaveBeenCalledWith('Sticky acknowledge')
    expect(run).not.toHaveBeenCalled()
  })

  it('offers the timed variant only when the server has it on', async () => {
    serverOptions.value = { timedAlarmAckEnabled: true }
    const items = await openMenu(mountTable(), 0)

    const timed = item(items, 'alarm.stickyAcknowledgeFor')
    expect(labels(timed.items)).toEqual(['1 hour', '4 hours', '1 day', '2 days', 'Other...'])

    timed.items[0].command()
    expect(notifyNotImplemented).toHaveBeenCalledWith('Sticky acknowledge for 1 hour')
  })
})

describe('AlarmTable menu on a selection', () => {
  it('keeps what works on many and drops what needs one alarm', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)

    expect(labels(items)).toEqual([
      'Acknowledge (2)',
      'Sticky acknowledge',
      'Resolve (2)',
      'Terminate (2)',
      'Copy to clipboard',
      'Copy message to clipboard',
      'Export to CSV',
    ])
  })

  it('runs on the whole selection', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)
    await item(items, 'alarm.resolve').command()
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'resolve', ids: [1, 2] }))
  })

  it('does not look up an object for the menu', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await openMenu(wrapper, 0)

    expect(menuObjectId.value).toBeNull()
  })
})

describe('AlarmTable Object submenu', () => {
  const entry = (id, extra = {}) => ({ id, label: id, ...extra })

  it('keeps what works outside the object perspectives', async () => {
    objectMenuItems.value = [
      entry('object.open', { items: [entry('object.open.logs')] }),
      entry('object.create'),
      { separator: true },
      entry('object.poll'),
      entry('object.manage'),
      entry('object.maintenance'),
      { separator: true },
      entry('object.delete'),
    ]
    const items = await openMenu(mountTable(), 0)

    const submenu = item(items, 'alarm.object').items
    expect(submenu.filter((i) => !i.separator).map((i) => i.id)).toEqual([
      'object.open',
      'object.poll',
      'object.manage',
    ])
  })

  it('leaves no stray separators behind', async () => {
    objectMenuItems.value = [
      entry('object.create'),
      { separator: true },
      entry('object.poll'),
      { separator: true },
      entry('object.organize'),
      { separator: true },
      entry('object.manage'),
      { separator: true },
    ]
    const items = await openMenu(mountTable(), 0)

    const submenu = item(items, 'alarm.object').items
    expect(submenu.map((i) => i.separator ?? i.id)).toEqual(['object.poll', true, 'object.manage'])
  })

  it('drops inspection items whose dialog only the object perspectives host', async () => {
    objectMenuItems.value = [
      entry('object.open', {
        items: [entry('object.open.logs'), { separator: true }, entry('object.open.explainStatus')],
      }),
    ]
    const items = await openMenu(mountTable(), 0)

    const open = item(item(items, 'alarm.object').items, 'object.open')
    expect(open.items.map((i) => i.id)).toEqual(['object.open.logs'])
  })

  it('loads the object of the alarm the menu opened on', async () => {
    await openMenu(mountTable(), 1)

    expect(menuObjectId.value).toBe(12)
  })
})

describe('AlarmTable Ask AI assistant', () => {
  it('is left out without the AI component', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.askAi')).toBeUndefined()
  })

  it('opens the chat and asks about the alarm with its object as context', async () => {
    aiAvailable.value = true
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.askAi').command()

    expect(isAiChatOpen.value).toBe(true)
    const [prompt, context] = sendMessage.mock.calls[0]
    expect(prompt).toContain('Alarm ID: 1')
    expect(context).toEqual({ type: 'object', object_id: 11, object_name: 'node-1' })
  })
})
