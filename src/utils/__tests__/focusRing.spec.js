import { describe, it, expect, beforeEach } from 'vitest'
import { focusWithRing } from '@/utils/focusRing'

describe('focusWithRing', () => {
  let element

  beforeEach(() => {
    document.body.innerHTML = '<div id="row" tabindex="-1"></div><button id="other"></button>'
    element = document.getElementById('row')
  })

  it('focuses the element and marks it so the ring shows', () => {
    focusWithRing(element)
    expect(document.activeElement).toBe(element)
    expect(element.hasAttribute('data-focus-ring')).toBe(true)
  })

  it('drops the mark when focus leaves', () => {
    focusWithRing(element)
    document.getElementById('other').focus()
    expect(element.hasAttribute('data-focus-ring')).toBe(false)
  })

  it('does nothing without an element', () => {
    expect(() => focusWithRing(null)).not.toThrow()
  })
})
