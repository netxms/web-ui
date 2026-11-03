import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import LogResultsStream from '@/components/logs/LogResultsStream.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    {
      path: '/infrastructure/:objectId?/:viewId?',
      name: 'infrastructure',
      component: { template: '<div />' },
    },
  ],
})

/** AlarmLog is the dense case. */
const alarmColumns = [
  { name: 'alarm_id', description: 'Alarm ID', type: 'integer', detail: false },
  { name: 'alarm_state', description: 'State', type: 'alarmState', detail: false },
  { name: 'hd_state', description: 'Helpdesk State', type: 'alarmHelpdeskState', detail: false },
  { name: 'source_object_id', description: 'Source', type: 'objectId', detail: false },
  { name: 'dci_id', description: 'DCI', type: 'integer', detail: false },
  { name: 'current_severity', description: 'Severity', type: 'severity', detail: false },
  { name: 'original_severity', description: 'Original Severity', type: 'severity', detail: false },
  { name: 'source_event_code', description: 'Event', type: 'eventCode', detail: false },
  { name: 'message', description: 'Message', type: 'text', detail: false },
  { name: 'repeat_count', description: 'Repeat Count', type: 'integer', detail: false },
  { name: 'creation_time', description: 'Created', type: 'timestamp', detail: false },
  { name: 'last_change_time', description: 'Last Changed', type: 'timestamp', detail: false },
  { name: 'ack_by', description: 'Ack by', type: 'userId', detail: false },
  { name: 'rule_guid', description: 'Rule', type: 'text', detail: false },
  { name: 'rule_description', description: 'Rule Description', type: 'text', detail: false },
  { name: 'alarm_key', description: 'Key', type: 'text', detail: false },
]

function alarmRow(id, severity) {
  return {
    id,
    alarm_id: id,
    alarm_state: 3,
    hd_state: 0,
    source_object_id: 10,
    dci_id: 0,
    current_severity: severity,
    original_severity: severity,
    source_event_code: 4,
    message: 'Node down',
    repeat_count: 1,
    creation_time: '2026-08-05T13:46:27.000Z',
    last_change_time: '2026-08-05T13:46:27.000Z',
    ack_by: 0,
    rule_guid: '2d2c3d32-49d4-4e76-b6aa-782b30d90f28',
    rule_description: 'Show alarm when node is down',
    alarm_key: 'NODE_DOWN_0x00000243',
  }
}

const resolver = {
  objectsById: new Map([[10, { id: 10, class: 'Node', name: '10.0.11.126' }]]),
  usersById: new Map(),
  eventsByCode: new Map([[4, 'SYS_NODE_DOWN']]),
  zonesByUin: new Map(),
}

function mountStream(props) {
  return mount(LogResultsStream, {
    props: { logName: 'AlarmLog', columns: alarmColumns, resolver, ...props },
    global: { plugins: [router] },
  })
}

describe('LogResultsStream headline', () => {
  it('shows the alarm message, not the event processing rule description', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)] })
    const message = wrapper.find('.stream-message')
    expect(message.text()).toBe('Node down')
    expect(message.text()).not.toContain('Show alarm when node is down')
  })

  it('spells out the severity rather than relying on colour alone', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)] })
    expect(wrapper.find('.stream-severity').text()).toContain('Critical')
  })

  it('tints the row for the severities that need to stand out', () => {
    const critical = mountStream({ rows: [alarmRow(1, 4)] }).find('.stream-row')
    const major = mountStream({ rows: [alarmRow(2, 3)] }).find('.stream-row')
    const normal = mountStream({ rows: [alarmRow(3, 0)] }).find('.stream-row')

    expect(critical.attributes('style')).toContain('background')
    expect(major.attributes('style')).toContain('background')
    // A wash on every row would just be a rainbow; only the top severities get one.
    expect(normal.attributes('style')).not.toContain('background')
    // Each severity still drives its own gutter colour.
    expect(critical.attributes('style')).not.toBe(major.attributes('style'))
  })
})

describe('LogResultsStream secondary line', () => {
  it('renders the same capped field set for every row, so values line up', () => {
    const wrapper = mountStream({ rows: [alarmRow(1, 4), alarmRow(2, 3)] })
    const rows = wrapper.findAll('.stream-row')
    const labelsOf = (row) => row.findAll('.stream-meta-label').map((n) => n.text())

    expect(labelsOf(rows[0])).toEqual(labelsOf(rows[1]))
    expect(labelsOf(rows[0]).length).toBeLessThanOrEqual(6)
  })

  it('does not repeat the fields already on the headline', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)] })
    const labels = wrapper.findAll('.stream-meta-label').map((n) => n.text())
    expect(labels).not.toContain('Message')
    expect(labels).not.toContain('Created')
    expect(labels).not.toContain('Source')
    expect(labels).not.toContain('Severity')
  })

  it('reports how many further fields the record drawer holds', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)] })
    // The fixture's columns minus those on the headline and in the meta grid.
    expect(wrapper.find('.stream-meta-more').text()).toBe('+6 more')
  })

  it('keeps the long, low-value fields off the row', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)] })
    expect(wrapper.text()).not.toContain('2d2c3d32-49d4-4e76-b6aa-782b30d90f28')
  })

  it('resolves ids to names on the secondary line too', () => {
    const wrapper = mountStream({ rows: [alarmRow(40345, 4)], recordIdColumn: 'alarm_id' })
    expect(wrapper.find('.stream-meta').text()).toContain('SYS_NODE_DOWN')
    expect(wrapper.find('.stream-meta').text()).toContain('Terminated')
  })

  it('shows an empty state instead of a bare list', () => {
    expect(mountStream({ rows: [] }).text()).toContain('No records match this query')
  })
})
