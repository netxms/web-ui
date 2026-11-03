import { describe, it, expect } from 'vitest'
import { Router } from 'lucide-vue-next'
import { ICON_PACK, ICON_PACK_ICONS } from '@/utils/iconPack'
import { lucideIconSvg } from '@/utils/iconSvg'

describe('iconPack', () => {
  it('has unique names, since re-running the import skips icons by name', () => {
    const names = ICON_PACK_ICONS.map((icon) => icon.name)
    expect(new Set(names).size).toBe(names.length)
    expect(ICON_PACK_ICONS).toHaveLength(ICON_PACK.reduce((n, g) => n + g.icons.length, 0))
  })

  it('names no vendor: client builds are white label', () => {
    const text = ICON_PACK.flatMap((g) => [g.group, ...g.icons.map((i) => i.name)]).join(' ')
    expect(text).not.toMatch(/netxms|raden|lucide/i)
  })

  it('renders a standalone square SVG in one dark ink', () => {
    const svg = lucideIconSvg(Router)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="48"')
    expect(svg).toContain('height="48"')
    expect(svg).toContain('stroke="#334155"')
    expect(svg).toContain('<path')
    expect(svg).not.toContain('class=')
  })
})
