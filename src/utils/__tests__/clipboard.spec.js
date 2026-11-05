import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from '@/utils/clipboard'

function stubClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

describe('copyText', () => {
  afterEach(() => {
    stubClipboard(undefined)
    delete document.execCommand
  })

  it('uses the clipboard API when the page has it', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard({ writeText })

    expect(await copyText('show version')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('show version')
  })

  it('still copies on plain HTTP, where the clipboard API does not exist', async () => {
    stubClipboard(undefined)
    let copied = null
    document.execCommand = vi.fn(() => {
      copied = document.activeElement.value
      return true
    })

    expect(await copyText('show version')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe('show version')
  })

  it('puts focus back where it was, so typing carries on in the terminal', async () => {
    stubClipboard(undefined)
    document.execCommand = vi.fn(() => true)
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()

    await copyText('x')

    expect(document.activeElement).toBe(field)
    field.remove()
  })

  it('reports failure instead of pretending, when the fallback is refused too', async () => {
    stubClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) })
    document.execCommand = vi.fn(() => false)

    expect(await copyText('x')).toBe(false)
  })
})
