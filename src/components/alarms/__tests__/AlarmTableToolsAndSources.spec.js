import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  executeTool,
  sourceObjects,
  objectsById,
  lastObjectLookup,
  objectMenuItems,
  tools,
  ToolDialogStub,
  IconStub,
  alarm,
  mountTable,
  dataRows,
  select,
  openMenu,
  item,
  resetHarness,
} from './alarmTableHarness'

beforeEach(resetHarness)

describe('AlarmTable tools', () => {
  const PING = { id: 5, name: 'Ping', type: 'action' }
  const ASK = {
    id: 6,
    name: 'Ask',
    type: 'action',
    inputFields: [{ name: 'host', sequence: 0, type: 0 }],
  }
  const objectToolsSlot = {
    id: 'object.tools',
    label: 'Tools',
    items: [{ id: 'object.tools.executeScript', label: 'Execute script' }],
  }

  it('leaves Tools off a source that has none', async () => {
    const items = await openMenu(mountTable(), 0)

    expect(item(items, 'alarm.tools')).toBeUndefined()
  })

  it('runs a top-level tool with the alarm, for its macros', async () => {
    tools.value = [PING]
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.tools').items[0].command()

    expect(executeTool).toHaveBeenCalledWith({ id: 11, name: 'node-1' }, PING, {}, { alarmId: 1 })
  })

  it('runs the same tool under Object without the alarm', async () => {
    tools.value = [PING]
    objectMenuItems.value = [objectToolsSlot]
    const items = await openMenu(mountTable(), 0)

    const objectTools = item(item(items, 'alarm.object').items, 'object.tools')
    objectTools.items.find((entry) => entry.label === 'Ping').command()

    expect(executeTool).toHaveBeenCalledWith({ id: 11, name: 'node-1' }, PING, {}, {})
  })

  it('asks for input first, then runs with what was entered and the alarm', async () => {
    tools.value = [ASK]
    const wrapper = mountTable()
    const items = await openMenu(wrapper, 0)

    item(items, 'alarm.tools').items[0].command()
    await nextTick()

    const dialog = wrapper.findComponent(ToolDialogStub)
    expect(executeTool).not.toHaveBeenCalled()
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('inputFields')).toEqual(ASK.inputFields)

    dialog.vm.$emit('submit', { host: 'a' })
    await flushPromises()

    expect(executeTool).toHaveBeenCalledWith(
      { id: 11, name: 'node-1' },
      ASK,
      { host: 'a' },
      { alarmId: 1 },
    )
  })

  it('offers no tools on a selection', async () => {
    tools.value = [PING]
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)

    expect(item(items, 'alarm.tools')).toBeUndefined()
  })
})

describe('AlarmTable source icons', () => {
  const NODE = { id: 11, class: 'Node', category: 0 }

  it('draws the source object icon next to its name', () => {
    sourceObjects.value = new Map([[11, NODE]])
    const wrapper = mountTable()

    const icon = dataRows(wrapper)[0].findComponent(IconStub)

    expect(icon.props('object')).toEqual(NODE)
    expect(dataRows(wrapper)[0].text()).toContain('node-1')
  })

  it('still holds the place of an icon it knows nothing about', () => {
    const wrapper = mountTable()

    expect(dataRows(wrapper)[0].findComponent(IconStub).props('object')).toBeNull()
  })

  it('looks up only sources the detailed list does not know yet', () => {
    sourceObjects.value = new Map([[11, NODE]])
    mountTable({ alarms: [alarm(1, 0), alarm(2, 0)] })

    expect(lastObjectLookup.value).toEqual([12])
  })

  it('looks up nothing until the detailed list has answered', () => {
    sourceObjects.value = undefined
    mountTable({ alarms: [alarm(1, 0)] })

    expect(lastObjectLookup.value).toEqual([])
  })

  it('takes a source it had to look up', () => {
    const fetched = { id: 12, class: 'Sensor', name: 'node-2' }
    sourceObjects.value = new Map([[11, NODE]])
    objectsById.value = new Map([[12, fetched]])
    const wrapper = mountTable()

    expect(dataRows(wrapper)[1].findComponent(IconStub).props('object')).toEqual(fetched)
  })
})
