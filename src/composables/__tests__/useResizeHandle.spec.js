import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useResizeHandle } from '@/composables/useResizeHandle'

const MIN = 100
const MAX = 500

/** Mounted: the composable registers `onUnmounted`, and bindings must land as attributes. */
function mountHandle(initial = 300, options = {}) {
  const size = ref(initial)
  const setSize = vi.fn((px) => (size.value = px))

  const wrapper = mount(
    defineComponent({
      setup() {
        const { isResizing, handleBindings } = useResizeHandle({
          size,
          setSize,
          min: MIN,
          max: MAX,
          label: 'Resize panel',
          ...options,
        })
        return { isResizing, handleBindings }
      },
      template: '<div class="handle" v-bind="handleBindings" />',
    }),
  )

  return { wrapper, size, setSize, handle: wrapper.get('.handle') }
}

function keydown(handle, key) {
  const preventDefault = vi.fn()
  handle.trigger('keydown', { key, preventDefault })
  return preventDefault
}

beforeEach(() => vi.restoreAllMocks())

describe('useResizeHandle', () => {
  describe('ARIA', () => {
    it('describes the handle as an adjustable vertical separator', () => {
      const { handle } = mountHandle(300)

      expect(handle.attributes('role')).toBe('separator')
      expect(handle.attributes('aria-orientation')).toBe('vertical')
      expect(handle.attributes('aria-label')).toBe('Resize panel')
      expect(handle.attributes('aria-valuemin')).toBe(String(MIN))
      expect(handle.attributes('aria-valuemax')).toBe(String(MAX))
    })

    it('is a tab stop, so the keyboard can reach it at all', () => {
      expect(mountHandle().handle.attributes('tabindex')).toBe('0')
    })

    it('reports the live width, not the width it was created with', async () => {
      const { wrapper, size, handle } = mountHandle(300)
      expect(handle.attributes('aria-valuenow')).toBe('300')

      size.value = 420
      await wrapper.vm.$nextTick()

      expect(handle.attributes('aria-valuenow')).toBe('420')
    })
  })

  describe('keyboard', () => {
    // Docked right: moving the separator left grows the panel.
    it('widens on ArrowLeft and narrows on ArrowRight', () => {
      const { setSize, handle } = mountHandle(300)

      keydown(handle, 'ArrowLeft')
      expect(setSize).toHaveBeenLastCalledWith(324)

      keydown(handle, 'ArrowRight')
      expect(setSize).toHaveBeenLastCalledWith(300)
    })

    it('honours a custom step', () => {
      const { setSize, handle } = mountHandle(300, { step: 50 })

      keydown(handle, 'ArrowLeft')
      expect(setSize).toHaveBeenLastCalledWith(350)
    })

    it('jumps to the extremes on Home and End', () => {
      const { setSize, handle } = mountHandle(300)

      keydown(handle, 'Home')
      expect(setSize).toHaveBeenLastCalledWith(MAX)

      keydown(handle, 'End')
      expect(setSize).toHaveBeenLastCalledWith(MIN)
    })

    it('clamps rather than running past the bounds', () => {
      const atMax = mountHandle(MAX - 5)
      keydown(atMax.handle, 'ArrowLeft')
      expect(atMax.setSize).toHaveBeenLastCalledWith(MAX)

      const atMin = mountHandle(MIN + 5)
      keydown(atMin.handle, 'ArrowRight')
      expect(atMin.setSize).toHaveBeenLastCalledWith(MIN)
    })

    it('ignores keys it does not handle, so Tab still moves focus', () => {
      const { setSize, handle } = mountHandle(300)

      const preventDefault = keydown(handle, 'Tab')

      expect(setSize).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('horizontal separator (a bottom-docked panel)', () => {
    it('reports its orientation, so a screen reader reads the right axis', () => {
      const { handle } = mountHandle(300, { orientation: 'horizontal' })
      expect(handle.attributes('aria-orientation')).toBe('horizontal')
    })

    // Docked at the bottom: up grows it.
    it('grows on ArrowUp and shrinks on ArrowDown', () => {
      const { setSize, handle } = mountHandle(300, { orientation: 'horizontal' })

      keydown(handle, 'ArrowUp')
      expect(setSize).toHaveBeenLastCalledWith(324)

      keydown(handle, 'ArrowDown')
      expect(setSize).toHaveBeenLastCalledWith(300)
    })

    it('ignores the horizontal arrows, which belong to the content beside it', () => {
      const { setSize, handle } = mountHandle(300, { orientation: 'horizontal' })

      keydown(handle, 'ArrowLeft')
      keydown(handle, 'ArrowRight')

      expect(setSize).not.toHaveBeenCalled()
    })

    it('grows as the pointer moves up', async () => {
      const { setSize, handle } = mountHandle(300, { orientation: 'horizontal' })

      await handle.trigger('mousedown', { clientY: 500 })
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 460 }))

      expect(setSize).toHaveBeenLastCalledWith(340)
    })
  })

  describe('bounds given as getters', () => {
    it('re-reads a max that changes after the handle was created', () => {
      let max = 400
      const { setSize, handle } = mountHandle(300, { max: () => max })

      keydown(handle, 'Home')
      expect(setSize).toHaveBeenLastCalledWith(400)

      max = 480
      keydown(handle, 'Home')
      expect(setSize).toHaveBeenLastCalledWith(480)
    })
  })

  describe('pointer drag', () => {
    it('widens as the pointer moves left and stops on mouseup', async () => {
      const { wrapper, setSize, handle } = mountHandle(300)

      await handle.trigger('mousedown', { clientX: 800 })
      expect(wrapper.vm.isResizing).toBe(true)

      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 760 }))
      expect(setSize).toHaveBeenLastCalledWith(340)

      window.dispatchEvent(new MouseEvent('mouseup'))
      expect(wrapper.vm.isResizing).toBe(false)

      setSize.mockClear()
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }))
      expect(setSize).not.toHaveBeenCalled()
    })

    it('clamps the drag to the bounds', async () => {
      const { setSize, handle } = mountHandle(300)

      await handle.trigger('mousedown', { clientX: 800 })
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }))

      expect(setSize).toHaveBeenLastCalledWith(MAX)
    })

    it('detaches its listeners when unmounted mid-drag', async () => {
      const { wrapper, setSize, handle } = mountHandle(300)

      await handle.trigger('mousedown', { clientX: 800 })
      wrapper.unmount()

      setSize.mockClear()
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
      expect(setSize).not.toHaveBeenCalled()
    })
  })
})
