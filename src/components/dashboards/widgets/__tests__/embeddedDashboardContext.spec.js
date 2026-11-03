import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useEmbedGuard, provideEmbedGuard, MAX_EMBED_DEPTH } from '../embeddedDashboardContext'

function mountChain(ids) {
  let guards = []

  function makeLevel(index) {
    if (index >= ids.length) {
      return defineComponent({
        setup() {
          guards[index] = useEmbedGuard()
          return () => h('div')
        },
      })
    }
    const Child = makeLevel(index + 1)
    return defineComponent({
      setup() {
        guards[index] = useEmbedGuard()
        provideEmbedGuard(ids[index])
        return () => h(Child)
      },
    })
  }

  const Root = makeLevel(0)
  mount(Root)
  return guards
}

describe('embeddedDashboardContext', () => {
  it('defaults to an empty visited set and depth 0 with no provider', () => {
    const [guard] = mountChain([])
    expect(guard.depth).toBe(0)
    expect(guard.visitedIds.size).toBe(0)
  })

  it('extends visitedIds and increments depth for each nested provider', () => {
    const guards = mountChain([1, 2])
    expect(guards[0].depth).toBe(0)
    expect(guards[0].visitedIds.has(1)).toBe(false)
    expect(guards[1].depth).toBe(1)
    expect(guards[1].visitedIds.has(1)).toBe(true)
    expect(guards[1].visitedIds.has(2)).toBe(false)
    expect(guards[2].depth).toBe(2)
    expect(guards[2].visitedIds.has(1)).toBe(true)
    expect(guards[2].visitedIds.has(2)).toBe(true)
  })

  it('lets a descendant detect an ancestor id as a cycle before rendering it again', () => {
    // A embeds B embeds A: inside B's canvas the guard already contains A's id.
    const guards = mountChain(['A', 'B'])
    const insideB = guards[2]
    expect(insideB.visitedIds.has('A')).toBe(true)
  })

  it('never adds a null self id to the visited set', () => {
    const guards = mountChain([null])
    expect(guards[1].visitedIds.size).toBe(0)
    expect(guards[1].depth).toBe(1)
  })

  it('exposes MAX_EMBED_DEPTH as a positive bound', () => {
    expect(MAX_EMBED_DEPTH).toBeGreaterThan(0)
  })
})
