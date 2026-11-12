import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  run,
  downloadCsv,
  writeText,
  serverOptions,
  alarm,
  ALARMS,
  mountTable,
  select,
  selectionButton,
  openMenu,
  item,
  resetHarness,
} from './alarmTableHarness'
import { tables } from '@/utils/appStorage'

beforeEach(resetHarness)

describe('AlarmTable selection', () => {
  it('offers the actions the selection allows, with how many they reach', async () => {
    const wrapper = mountTable()

    await select(wrapper, 0, 2)

    expect(wrapper.find('.selection-actions').text()).toContain('2 selected')
    expect(selectionButton(wrapper, 'Acknowledge (1)')).toBeTruthy()
    expect(selectionButton(wrapper, 'Resolve (2)')).toBeTruthy()
    expect(selectionButton(wrapper, 'Terminate (2)')).toBeTruthy()
  })

  it('hides an action nothing selected can take', async () => {
    const wrapper = mountTable()

    await select(wrapper, 3)

    expect(
      wrapper.findAll('.selection-actions button').map((b) => b.attributes('aria-label')),
    ).not.toContain('Acknowledge (0)')
    expect(selectionButton(wrapper, 'Terminate (1)')).toBeTruthy()
  })

  it('runs an action on the alarms it fits and deselects the ones that changed', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 2)

    await selectionButton(wrapper, 'Acknowledge (1)').trigger('click')
    await flushPromises()

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'acknowledge', ids: [1] }))
    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('drops an alarm from the selection when it leaves the list', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await wrapper.setProps({ alarms: ALARMS.slice(1) })

    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('drops an alarm from the selection when the filter hides it', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    await wrapper.find('.filter-stub').setValue('Message 2')
    await nextTick()

    expect(wrapper.find('.selection-actions').text()).toContain('1 selected')
  })

  it('offers everything the filter shows once a whole page is selected', async () => {
    // The smallest page: a page of 100 rows takes jsdom seconds to render.
    tables.set('alarms.pageSize', 10)
    const many = Array.from({ length: 15 }, (_, i) => alarm(i + 1, 0))
    const wrapper = mountTable({ alarms: many })

    await select(wrapper, 0)
    expect(selectionButton(wrapper, 'Select all 15')).toBeUndefined()

    await wrapper.find('.app-table__checkbox-th .app-table__checkbox-wrap').trigger('click')
    expect(wrapper.find('.selection-actions').text()).toContain('10 selected')
    await selectionButton(wrapper, 'Select all 15').trigger('click')

    expect(wrapper.find('.selection-actions').text()).toContain('15 selected')
    expect(selectionButton(wrapper, 'Select all 15')).toBeUndefined()
  })

  it('has no select-all offer when one page already holds everything', async () => {
    const wrapper = mountTable()

    await wrapper.find('.app-table__checkbox-th .app-table__checkbox-wrap').trigger('click')

    expect(selectionButton(wrapper, 'Select all 4')).toBeUndefined()
  })
})

describe('AlarmTable under strict alarm flow', () => {
  it('terminates only resolved alarms', async () => {
    serverOptions.value = { strictAlarmStatusFlow: true }
    const wrapper = mountTable()

    await select(wrapper, 0, 3)

    expect(selectionButton(wrapper, 'Terminate (1)')).toBeTruthy()
  })
})

describe('AlarmTable copy and export', () => {
  it('copies severity, source and message lines', async () => {
    const wrapper = mountTable()
    await select(wrapper, 0, 1)

    const items = await openMenu(wrapper, 0)
    await item(items, 'alarm.copy').command()

    expect(writeText).toHaveBeenCalledWith('[Minor]\tnode-1\tMessage 1\n[Minor]\tnode-2\tMessage 2')
  })

  it('copies messages alone', async () => {
    const items = await openMenu(mountTable(), 0)

    await item(items, 'alarm.copyMessage').command()

    expect(writeText).toHaveBeenCalledWith('Message 1')
  })

  it('exports the targets as CSV with the shown columns', async () => {
    const items = await openMenu(mountTable(), 0)

    item(items, 'alarm.export').command()

    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toBe('alarms')
    expect(csv.split('\r\n')[0]).toContain('Sev,State,Source')
    expect(csv.split('\r\n')[1]).toContain('Minor,Outstanding,node-1')
  })

  it('exports what the filter shows from the toolbar, or the selection when there is one', async () => {
    const wrapper = mountTable()

    await wrapper.find('.alarm-export').trigger('click')
    expect(downloadCsv.mock.calls[0][1].split('\r\n')).toHaveLength(5)

    await select(wrapper, 0)
    await wrapper.find('.alarm-export').trigger('click')
    expect(downloadCsv.mock.calls[1][1].split('\r\n')).toHaveLength(2)
  })
})
