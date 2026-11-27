import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toValue } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

const IF_ENTRY = '1.3.6.1.2.1.2.2.1'
const IF_IN_OCTETS = '1.3.6.1.2.1.2.2.1.10'

const MIB_NODES = {
  [IF_ENTRY]: {
    oid: IF_ENTRY,
    name: 'ifEntry',
    type: 'SEQUENCE',
    children: [{ subId: 10, oid: IF_IN_OCTETS, name: 'ifInOctets', hasChildren: false }],
  },
  [IF_IN_OCTETS]: { oid: IF_IN_OCTETS, name: 'ifInOctets', type: 'COUNTER32', children: [] },
}

vi.mock('@/queries/useMibQueries', () => ({
  useMibChildren: () => ({ data: ref([]), isLoading: ref(false) }),
  useMibNode: (oid) => ({
    data: computed(() => MIB_NODES[toValue(oid)]),
    isFetching: ref(false),
  }),
  // The deepest known object, without the real lookup's pause.
  useClosestMibObject: (text) =>
    computed(() => {
      const oid = (toValue(text) ?? '').replace(/^\./, '')
      const known = Object.keys(MIB_NODES).filter((o) => oid === o || oid.startsWith(`${o}.`))
      return known.sort((a, b) => b.length - a.length)[0] ?? null
    }),
}))

const { default: MibOidPickerDialog } = await import('../MibOidPickerDialog.vue')

let wrapper

async function openDialog(props) {
  wrapper = mount(MibOidPickerDialog, {
    props: { visible: false, ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue], stubs: { SnmpWalkDialog: true } },
  })
  await wrapper.setProps({ visible: true })
  // PrimeVue's Dialog mounts its teleported content a tick after it opens.
  await nextTick()
}

function button(label) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
}

function oidInput() {
  return document.querySelector('input.oid-input')
}

async function typeOid(value) {
  oidInput().value = value
  oidInput().dispatchEvent(new Event('input'))
  await nextTick()
}

function walkDialog() {
  return wrapper.findComponent({ name: 'SnmpWalkDialog' })
}

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('MibOidPickerDialog walk', () => {
  it('has no Walk button without a node to walk', async () => {
    await openDialog({ oid: '1.3.6.1.2.1.2.2' })
    expect(button('Walk...')).toBeUndefined()
  })

  it('walks the typed OID on the node through the given agent', async () => {
    await openDialog({ oid: '', walkObjectId: 100, walkSnmpAgent: 'ups' })
    await typeOid('.1.3.6.1.2.1.2.2')
    button('Walk...').click()
    await nextTick()

    expect(walkDialog().props()).toMatchObject({
      visible: true,
      objectId: 100,
      snmpAgentName: 'ups',
      oid: '1.3.6.1.2.1.2.2',
    })
  })

  it('does not walk an OID that does not parse', async () => {
    await openDialog({ oid: '', walkObjectId: 100 })
    await typeOid('ifTable')
    button('Walk...').click()
    await nextTick()

    expect(walkDialog().props('visible')).toBe(false)
    expect(document.body.textContent).toContain('OID must be numbers separated by dots')
  })

  it('a picked variable fills the field and selects with its MIB object', async () => {
    await openDialog({ oid: '1.3.6.1.2.1.2.2', walkObjectId: 100 })
    walkDialog().vm.$emit('select', { oid: `${IF_IN_OCTETS}.3`, objectOid: IF_IN_OCTETS })
    await nextTick()
    expect(oidInput().value).toBe(`${IF_IN_OCTETS}.3`)

    button('OK').click()
    expect(wrapper.emitted('select')[0]).toEqual([`${IF_IN_OCTETS}.3`, MIB_NODES[IF_IN_OCTETS]])
  })
})

describe('MibOidPickerDialog typed OID', () => {
  it('selects the column a typed instance belongs to and names the DCI after it', async () => {
    await openDialog({ oid: '' })
    await typeOid(`${IF_IN_OCTETS}.4`)
    await nextTick()
    expect(document.body.textContent).toContain('ifInOctets')

    button('OK').click()
    expect(wrapper.emitted('select')[0]).toEqual([`${IF_IN_OCTETS}.4`, MIB_NODES[IF_IN_OCTETS]])
  })

  it('selects a broader object for an OID the MIBs do not describe, without naming the DCI', async () => {
    await openDialog({ oid: '' })
    await typeOid(`${IF_ENTRY}.99.1`)
    await nextTick()
    expect(document.body.textContent).toContain('ifEntry')

    button('OK').click()
    expect(wrapper.emitted('select')[0]).toEqual([`${IF_ENTRY}.99.1`, null])
  })
})
