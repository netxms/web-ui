import { describe, it, expect, vi, beforeEach } from 'vitest'

const resolve = vi.fn((to) => ({ href: `/base/${to.name}/${to.params?.objectId ?? ''}` }))
vi.mock('@/router', () => ({ default: { resolve: (to) => resolve(to) } }))

const { shouldOpenInNewTab, resolveHref, openInNewTab } = await import('@/utils/navigation')

/** Minimal stand-in for the mouse events the handlers actually read. */
function mouseEvent(type, props = {}) {
  return { type, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...props }
}

describe('shouldOpenInNewTab', () => {
  it('accepts ctrl+click and cmd+click', () => {
    expect(shouldOpenInNewTab(mouseEvent('click', { ctrlKey: true }))).toBe(true)
    expect(shouldOpenInNewTab(mouseEvent('click', { metaKey: true }))).toBe(true)
  })

  it('accepts middle click', () => {
    expect(shouldOpenInNewTab(mouseEvent('auxclick', { button: 1 }))).toBe(true)
    expect(shouldOpenInNewTab(mouseEvent('click', { button: 1 }))).toBe(true)
  })

  it('rejects a plain left click', () => {
    expect(shouldOpenInNewTab(mouseEvent('click'))).toBe(false)
  })

  it('rejects modifiers that mean something else', () => {
    expect(shouldOpenInNewTab(mouseEvent('click', { shiftKey: true }))).toBe(false)
    expect(shouldOpenInNewTab(mouseEvent('click', { altKey: true }))).toBe(false)
  })

  it('rejects right click, including the ctrl+click that Safari reports as auxclick', () => {
    expect(shouldOpenInNewTab(mouseEvent('auxclick', { button: 2 }))).toBe(false)
    expect(shouldOpenInNewTab(mouseEvent('auxclick', { button: 2, ctrlKey: true }))).toBe(false)
  })

  it('rejects a missing event', () => {
    expect(shouldOpenInNewTab(null)).toBe(false)
  })
})

describe('resolveHref', () => {
  it('delegates to the router so the base path is included', () => {
    expect(resolveHref({ name: 'infrastructure', params: { objectId: 10 } })).toBe(
      '/base/infrastructure/10',
    )
  })
})

describe('openInNewTab', () => {
  let opened

  beforeEach(() => {
    opened = { opener: {} }
    vi.stubGlobal(
      'open',
      vi.fn(() => opened),
    )
  })

  it('opens the resolved href in a new tab and severs the opener', () => {
    openInNewTab({ name: 'infrastructure', params: { objectId: 10 } })
    expect(window.open).toHaveBeenCalledWith('/base/infrastructure/10', '_blank')
    expect(opened.opener).toBeNull()
  })

  it('survives a blocked popup', () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    )
    expect(() => openInNewTab({ name: 'alarms', params: {} })).not.toThrow()
  })
})
