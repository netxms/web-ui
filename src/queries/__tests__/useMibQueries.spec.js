import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import * as mibApi from '@/api/mibApi'
import { useClosestMibObject } from '@/queries/useMibQueries'

vi.mock('@/api/mibApi')

function child(oid, name, hasChildren) {
  return { subId: Number(oid.split('.').pop()), oid, name, hasChildren }
}

const TREE = {
  '': [child('1', 'iso', true)],
  1: [child('1.3', 'org', true)],
  1.3: [child('1.3.6', 'dod', true), child('1.3.7', 'other', false)],
  '1.3.6': [child('1.3.6.1', 'internet', false)],
}

let wrapper

function setup(text) {
  let closest
  const Host = defineComponent({
    setup() {
      closest = useClosestMibObject(text)
      return () => h('div')
    },
  })
  wrapper = mount(Host, {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  })
  return closest
}

beforeEach(() => {
  vi.useFakeTimers()
  mibApi.getMibNode.mockReset()
  mibApi.getMibNode.mockImplementation(async (oid) => ({ children: TREE[oid] ?? [] }))
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})

describe('useClosestMibObject', () => {
  it('finds the deepest MIB object once typing pauses', async () => {
    const text = ref('1.3.6.1.4.1.9')
    const closest = setup(text)
    await vi.advanceTimersByTimeAsync(100)
    expect(closest.value).toBeNull()
    expect(mibApi.getMibNode).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBe('1.3.6.1')
  })

  it('takes a leading dot, as typed OIDs often have one', async () => {
    const closest = setup(ref('.1.3.7.0'))
    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBe('1.3.7')
  })

  it('only answers for the latest text', async () => {
    const text = ref('1.3.6')
    const closest = setup(text)
    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBe('1.3.6')

    text.value = '1.3.7.5'
    await vi.advanceTimersByTimeAsync(100)
    text.value = '1.3.6.1.2'
    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBe('1.3.6.1')
  })

  it('is null for text that is not an OID or outside the MIBs', async () => {
    const text = ref('ifTable')
    const closest = setup(text)
    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBeNull()

    text.value = '2.5.4'
    await vi.advanceTimersByTimeAsync(300)
    expect(closest.value).toBeNull()
  })
})
