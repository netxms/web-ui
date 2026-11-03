import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'
import { provideDashboardContext, useEffectiveObjectId } from '../useDashboardContext'

function probe(objectId) {
  const seen = {}
  const Child = defineComponent({
    setup() {
      seen.effective = useEffectiveObjectId(objectId)
      return () => h('span')
    },
  })
  return { Child, read: () => seen.effective.value }
}

function withContext(contextObjectId, Child) {
  return defineComponent({
    setup() {
      provideDashboardContext({ dashboardId: 1, contextObjectId })
      return () => h(Child)
    },
  })
}

describe('useEffectiveObjectId', () => {
  it('resolves the sentinel against the nearest provider, reactively', async () => {
    const context = ref(7)
    const { Child, read } = probe(CONTEXT_OBJECT_ID)
    mount(withContext(context, Child))
    expect(read()).toBe(7)
    context.value = 9
    await nextTick()
    expect(read()).toBe(9)
  })

  it('resolves the sentinel to 0 with no provider', () => {
    const { Child, read } = probe(CONTEXT_OBJECT_ID)
    mount(Child)
    expect(read()).toBe(0)
  })

  it('leaves concrete ids alone inside a context', () => {
    const { Child, read } = probe(42)
    mount(withContext(7, Child))
    expect(read()).toBe(42)
  })
})
