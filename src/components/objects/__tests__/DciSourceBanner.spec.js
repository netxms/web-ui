import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import DciSourceBanner from '@/components/objects/DciSourceBanner.vue'
import { objectsForTest } from '@/queries/useObjectQueries'
import { sourceRootForTest } from '@/queries/useDciConfigQueries'
import { DCF_TEMPLATE_OVERRIDE } from '@/composables/useDciFlags'
import router from '@/router'

vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/target' }), push: vi.fn() },
}))

// Objects by id, settable per test; an absent id behaves like an object the user cannot read.
vi.mock('@/queries/useObjectQueries', async () => {
  const { computed, reactive, toValue } = await import('vue')
  const objects = reactive({})
  return {
    objectsForTest: objects,
    useObject: (id) => ({ data: computed(() => objects[toValue(id)] ?? null) }),
  }
})

// The resolved end of the chain, settable per test (undefined while "loading").
vi.mock('@/queries/useDciConfigQueries', async () => {
  const { computed, ref } = await import('vue')
  const root = ref(undefined)
  return {
    sourceRootForTest: root,
    useDciSourceRoot: () => ({ data: computed(() => root.value) }),
  }
})

const owner = { id: 100, class: 'Node', name: 'sw-core' }
const template = { id: 20, class: 'Template', name: 'Interface Traffic SNMP' }
const cluster = { id: 30, class: 'Cluster', name: 'db-cluster' }

function mountBanner(dci) {
  return mount(DciSourceBanner, {
    props: { dci, ownerObject: owner },
    global: { plugins: [PrimeVue] },
  })
}

beforeEach(() => {
  for (const key of Object.keys(objectsForTest)) delete objectsForTest[key]
  sourceRootForTest.value = undefined
  router.push.mockClear()
})

describe('DciSourceBanner', () => {
  it('says nothing about a DCI created on the object itself', () => {
    sourceRootForTest.value = null
    const wrapper = mountBanner({ templateId: 0, templateItemId: 0, flags: 0 })
    expect(wrapper.find('.dci-source-banner').exists()).toBe(false)
  })

  it('waits for the chain to be resolved', () => {
    const wrapper = mountBanner({ templateId: 20, templateItemId: 2243, flags: 0 })
    expect(wrapper.find('.dci-source-banner').exists()).toBe(false)
  })

  it('names the template and warns that local changes can be overwritten', () => {
    sourceRootForTest.value = { objectId: 20, dciId: 2243, object: template, prototype: null }
    const wrapper = mountBanner({ templateId: 20, templateItemId: 2243, flags: 0 })

    expect(wrapper.text()).toContain(
      'Added by template "Interface Traffic SNMP". Local changes can be overwritten at any moment.',
    )
    expect(wrapper.find('.p-message-warn').exists()).toBe(true)
  })

  it("opens the template's DCI from Edit in template", async () => {
    sourceRootForTest.value = { objectId: 20, dciId: 2243, object: template, prototype: null }
    const wrapper = mountBanner({ templateId: 20, templateItemId: 2243, flags: 0 })

    const link = wrapper.find('a')
    expect(link.text()).toBe('Edit in template')
    await link.trigger('click', { button: 0 })

    expect(router.push).toHaveBeenCalledWith({
      name: 'templates',
      params: { objectId: 20, viewId: 'dataCollection', entityId: '2243' },
    })
  })

  it('sends an instance-discovered DCI to the template its prototype came from', async () => {
    sourceRootForTest.value = {
      objectId: 20,
      dciId: 1532,
      object: template,
      prototype: { id: 1533, templateId: 20, templateItemId: 1532 },
    }
    const wrapper = mountBanner({ templateId: 100, templateItemId: 1533, flags: 0 })

    expect(wrapper.text()).toContain(
      'Created by instance discovery from template "Interface Traffic SNMP".',
    )
    const link = wrapper.find('a')
    expect(link.text()).toBe('Edit in template')
    await link.trigger('click', { button: 0 })
    expect(router.push).toHaveBeenCalledWith({
      name: 'templates',
      params: { objectId: 20, viewId: 'dataCollection', entityId: '1532' },
    })
  })

  it('sends an instance-discovered DCI with a local prototype to that prototype', async () => {
    sourceRootForTest.value = {
      objectId: 100,
      dciId: 1533,
      object: owner,
      prototype: { id: 1533, templateId: 0, description: 'Inbound traffic on {instance}' },
    }
    const wrapper = mountBanner({ templateId: 100, templateItemId: 1533, flags: 0 })

    expect(wrapper.text()).toContain(
      'Created by instance discovery from "Inbound traffic on {instance}".',
    )
    const link = wrapper.find('a')
    expect(link.text()).toBe('Edit prototype')
    await link.trigger('click', { button: 0 })
    expect(router.push).toHaveBeenCalledWith({
      name: 'infrastructure',
      params: { objectId: 100, viewId: 'dcis', entityId: '1533' },
    })
  })

  it('calls a cluster a cluster', () => {
    sourceRootForTest.value = { objectId: 30, dciId: 77, object: cluster, prototype: null }
    const wrapper = mountBanner({ templateId: 30, templateItemId: 77, flags: 0 })

    expect(wrapper.text()).toContain('Added by cluster "db-cluster".')
    expect(wrapper.find('a').text()).toBe('Edit in cluster')
  })

  it('names both the cluster that added the DCI and the template it came from', () => {
    objectsForTest[30] = cluster
    sourceRootForTest.value = { objectId: 20, dciId: 2243, object: template, prototype: null }
    const wrapper = mountBanner({ templateId: 30, templateItemId: 77, flags: 0 })

    expect(wrapper.text()).toContain(
      'Added by cluster "db-cluster", from template "Interface Traffic SNMP".',
    )
    expect(wrapper.find('a').text()).toBe('Edit in template')
  })

  it('tells protected local changes apart, as information rather than a warning', () => {
    sourceRootForTest.value = { objectId: 20, dciId: 2243, object: template, prototype: null }
    const wrapper = mountBanner({
      templateId: 20,
      templateItemId: 2243,
      flags: DCF_TEMPLATE_OVERRIDE,
    })

    expect(wrapper.text()).toContain('Local changes are protected from template updates.')
    expect(wrapper.find('.p-message-info').exists()).toBe(true)
  })

  it('names a source object the user cannot read by id, with no way to open it', () => {
    sourceRootForTest.value = { objectId: 20, dciId: 2243, object: null, prototype: null }
    const wrapper = mountBanner({ templateId: 20, templateItemId: 2243, flags: 0 })

    expect(wrapper.text()).toContain('Added by object 20.')
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
