import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import LogCell from '@/components/logs/LogCell.vue'

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

function mountCell(props) {
  return mount(LogCell, { props, global: { plugins: [router] } })
}

const resolver = {
  objectsById: new Map([[10, { id: 10, class: 'Node', name: 'web-01' }]]),
  usersById: new Map([[1, 'admin']]),
  eventsByCode: new Map([[4, 'SYS_NODE_DOWN']]),
  zonesByUin: new Map([[7, 'DMZ']]),
}

describe('LogCell', () => {
  it('renders a placeholder for missing values', () => {
    const wrapper = mountCell({ value: null, column: { name: 'a', type: 'text' } })
    expect(wrapper.find('.log-cell--empty').exists()).toBe(true)
  })

  it('formats timestamps and keeps the raw value in the title', () => {
    const value = '2026-08-05T10:00:00.000Z'
    const wrapper = mountCell({ value, column: { name: 't', type: 'timestamp' } })
    expect(wrapper.attributes('title')).toBe(value)
    expect(wrapper.text()).not.toBe(value)
  })

  it('labels coded values instead of showing the code', () => {
    const wrapper = mountCell({ value: 2, column: { name: 'op', type: 'assetOperation' } })
    expect(wrapper.text()).toBe('Update')
  })

  it('renders severity with the shared alarm palette', () => {
    const wrapper = mountCell({ value: 4, column: { name: 's', type: 'severity' } })
    expect(wrapper.text()).toContain('Critical')
    const icon = wrapper.find('svg.status-icon')
    expect(icon.classes()).toContain('lucide-octagon-x')
    expect(icon.attributes('style')).toContain('var(--netxms-status-critical)')
  })

  it('links a resolved object into the infrastructure perspective', () => {
    const wrapper = mountCell({ value: 10, column: { name: 'o', type: 'objectId' }, resolver })
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('web-01')
    expect(link.attributes('href')).toContain('/infrastructure/10')
  })

  it('keeps an object-link click off the surrounding row, which opens the record drawer', async () => {
    const wrapper = mount(
      {
        components: { LogCell },
        props: ['resolver'],
        template:
          '<div class="row" @click="$emit(\'rowclick\')"><LogCell :value="10" :column="{ name: \'o\', type: \'objectId\' }" :resolver="resolver" /></div>',
      },
      { props: { resolver }, global: { plugins: [router] } },
    )

    await wrapper.find('a').trigger('click')
    expect(wrapper.emitted('rowclick')).toBeUndefined()

    await wrapper.find('.row').trigger('click')
    expect(wrapper.emitted('rowclick')).toHaveLength(1)
  })

  it('treats object id zero as "no object", not as an unresolved id', () => {
    const wrapper = mountCell({ value: 0, column: { name: 'o', type: 'objectId' }, resolver })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.find('.log-cell--empty').exists()).toBe(true)
  })

  it('shows a bracketed id when a lookup has no entry', () => {
    // Accounts without "manage users" get a 403 on the user list; the id must still show.
    const wrapper = mountCell({ value: 99, column: { name: 'u', type: 'userId' }, resolver })
    expect(wrapper.text()).toContain('[99]')
    expect(wrapper.find('.log-cell--unresolved').exists()).toBe(true)
  })

  it.each([-1, 0xffffffff])('treats user id %s as "nobody", not as an unresolved id', (value) => {
    // INVALID_UID reaches us as -1 or 4294967295 depending on the database column.
    const wrapper = mountCell({ value, column: { name: 'ack_by', type: 'userId' }, resolver })
    expect(wrapper.text()).not.toContain(String(value))
    expect(wrapper.find('.log-cell--empty').exists()).toBe(true)
  })

  it('keeps user id zero as the built-in system account', () => {
    const wrapper = mountCell({
      value: 0,
      column: { name: 'term_by', type: 'userId' },
      resolver: { ...resolver, usersById: new Map([[0, 'system']]) },
    })
    expect(wrapper.text()).toContain('system')
  })

  it('resolves users, events and zones by their lookup maps', () => {
    expect(
      mountCell({ value: 1, column: { name: 'u', type: 'userId' }, resolver }).text(),
    ).toContain('admin')
    expect(
      mountCell({ value: 4, column: { name: 'e', type: 'eventCode' }, resolver }).text(),
    ).toContain('SYS_NODE_DOWN')
    expect(
      mountCell({ value: 7, column: { name: 'z', type: 'zoneUIN' }, resolver }).text(),
    ).toContain('DMZ')
  })

  it('pretty-prints parsed JSON detail columns', () => {
    const wrapper = mountCell({ value: { a: 1 }, column: { name: 'raw', type: 'jsonDetails' } })
    expect(wrapper.find('pre').text()).toBe('{\n  "a": 1\n}')
  })

  it('falls back to plain text for a type this client does not know', () => {
    const wrapper = mountCell({ value: 'hello', column: { name: 'x', type: 'somethingNew' } })
    expect(wrapper.text()).toBe('hello')
  })
})
