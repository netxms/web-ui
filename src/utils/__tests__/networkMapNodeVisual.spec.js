import { describe, it, expect } from 'vitest'
import {
  computeNodeVisual,
  MAP_OBJECT_DISPLAY_MODES,
  NODE_RADIUS,
} from '@/utils/networkMapNodeVisual'
import { resolveMapRenderOptions, MAP_FLAGS } from '@/utils/networkMapUtils'

/** Deterministic stand-in for the canvas 2D text measurement. */
const measure = (text, fontSize) => text.length * fontSize * 0.5

/** Render options for a given display mode and MF_* bitmask. */
function options(displayMode, flags = 0) {
  return resolveMapRenderOptions({ rawContent: { objectDisplayMode: displayMode, flags } })
}

const ALL_STATUS_FLAGS =
  MAP_FLAGS.SHOW_STATUS_ICON | MAP_FLAGS.SHOW_STATUS_FRAME | MAP_FLAGS.SHOW_STATUS_BKGND

const element = { objectIpAddress: '10.0.0.1', objectMacAddress: '00:11:22:33:44:55' }

describe('computeNodeVisual — icon mode', () => {
  const mode = MAP_OBJECT_DISPLAY_MODES.ICON

  it('is a circle of the historical size with a glyph and a pill label', () => {
    const v = computeNodeVisual(element, 'core-sw-1', options(mode, ALL_STATUS_FLAGS), measure)
    expect(v.shape).toBe('ellipse')
    expect(v.width).toBe(NODE_RADIUS * 2)
    expect(v.height).toBe(NODE_RADIUS * 2)
    expect(v.halfExtent).toBe(NODE_RADIUS)
    expect(v.glyph).not.toBeNull()
    expect(v.plate).not.toBeNull()
    expect(v.textLines.map((l) => l.text)).toEqual(['core-sw-1'])
  })

  it('honours each status flag independently', () => {
    const v = computeNodeVisual(element, 'n', options(mode, MAP_FLAGS.SHOW_STATUS_FRAME), measure)
    expect(v.statusBorder).toBe(true)
    expect(v.statusFill).toBe(false)
    expect(v.glyph.useStatusColor).toBe(false)
  })

  it('drops all status colouring when every status flag is clear', () => {
    const v = computeNodeVisual(element, 'n', options(mode, 0), measure)
    expect(v.statusFill).toBe(false)
    expect(v.statusBorder).toBe(false)
    expect(v.glyph.useStatusColor).toBe(false)
  })

  it('sizes the pill plate to the measured label', () => {
    const short = computeNodeVisual(element, 'a', options(mode), measure)
    const long = computeNodeVisual(element, 'a-much-longer-name', options(mode), measure)
    expect(long.plate.width).toBeGreaterThan(short.plate.width)
    // Plate stays centred under the node whatever its width.
    expect(long.plate.x).toBe(-long.plate.width / 2)
  })
})

describe('computeNodeVisual — small label mode', () => {
  const mode = MAP_OBJECT_DISPLAY_MODES.SMALL_LABEL

  it('is a content-sized chip with no separate plate', () => {
    const v = computeNodeVisual(element, 'edge-1', options(mode), measure)
    expect(v.shape).toBe('round-rectangle')
    expect(v.plate).toBeNull()
    expect(v.height).toBe(22)
    expect(v.width).toBeGreaterThan(measure('edge-1', 11))
  })

  it('always shows status, ignoring the icon-only flags', () => {
    const v = computeNodeVisual(element, 'edge-1', options(mode, 0), measure)
    expect(v.statusFill).toBe(true)
    expect(v.statusBorder).toBe(true)
    // The legacy small-label figure draws a plain class icon, never a tinted one.
    expect(v.glyph.useStatusColor).toBe(false)
  })

  it('lays the glyph out left of the name', () => {
    const v = computeNodeVisual(element, 'edge-1', options(mode), measure)
    expect(v.glyph.x).toBeLessThan(v.textLines[0].x)
    expect(v.textLines[0].anchor).toBe('start')
  })
})

describe('computeNodeVisual — large label mode', () => {
  const mode = MAP_OBJECT_DISPLAY_MODES.LARGE_LABEL

  it('stacks the name over the IP and MAC', () => {
    const v = computeNodeVisual(element, 'core', options(mode), measure)
    expect(v.textLines.map((l) => l.text)).toEqual(['core', '10.0.0.1 (00:11:22:33:44:55)'])
    expect(v.height).toBe(46)
  })

  it('shrinks to one line when the object has no address', () => {
    const v = computeNodeVisual({}, 'core', options(mode), measure)
    expect(v.textLines).toHaveLength(1)
    expect(v.height).toBe(34)
    expect(v.textLines[0].y).toBe(0)
  })

  it('shows the IP alone when there is no MAC (nodes have none in the WebAPI)', () => {
    const v = computeNodeVisual({ objectIpAddress: '10.0.0.9' }, 'n', options(mode), measure)
    expect(v.textLines[1].text).toBe('10.0.0.9')
  })

  it('widens to fit whichever line is longer', () => {
    const longInfo = { objectIpAddress: '10.0.0.1', objectMacAddress: 'aa:bb:cc:dd:ee:ff' }
    const wide = computeNodeVisual(longInfo, 'n', options(mode), measure)
    const narrow = computeNodeVisual({}, 'n', options(mode), measure)
    expect(wide.width).toBeGreaterThan(narrow.width)
  })
})

describe('computeNodeVisual — status mode', () => {
  const mode = MAP_OBJECT_DISPLAY_MODES.STATUS

  it('draws the status marker alone', () => {
    const v = computeNodeVisual(element, 'core', options(mode), measure)
    expect(v.shape).toBe('ellipse')
    expect(v.glyph).toBeNull()
    expect(v.plate).toBeNull()
    expect(v.textLines).toEqual([])
  })

  it('keeps status colouring even with every status flag clear', () => {
    // With no icon, frame or label there would be nothing left to draw otherwise.
    const v = computeNodeVisual(element, 'core', options(mode, 0), measure)
    expect(v.statusFill).toBe(true)
    expect(v.statusBorder).toBe(true)
  })
})

describe('computeNodeVisual — floor plan mode', () => {
  const mode = MAP_OBJECT_DISPLAY_MODES.FLOOR_PLAN

  it("uses the element's persisted size and centres the name", () => {
    const v = computeNodeVisual({ width: 220, height: 140 }, 'Server room', options(mode), measure)
    expect(v.width).toBe(220)
    expect(v.height).toBe(140)
    expect(v.resizable).toBe(true)
    expect(v.textLines[0]).toMatchObject({ text: 'Server room', x: 0, y: 0, anchor: 'middle' })
  })

  it('defaults to 100x100 for elements with no stored size', () => {
    const v = computeNodeVisual({}, 'Room', options(mode), measure)
    expect(v.width).toBe(100)
    expect(v.height).toBe(100)
  })

  it('clamps to the legacy minimums', () => {
    const v = computeNodeVisual({ width: 5, height: 5 }, 'Room', options(mode), measure)
    expect(v.width).toBe(40)
    expect(v.height).toBe(20)
  })
})

describe('computeNodeVisual — fallbacks', () => {
  it('falls back to icon mode for an unknown display mode', () => {
    const v = computeNodeVisual(element, 'n', options(99), measure)
    expect(v.shape).toBe('ellipse')
    expect(v.width).toBe(NODE_RADIUS * 2)
  })

  it('survives a missing element', () => {
    for (const mode of Object.values(MAP_OBJECT_DISPLAY_MODES)) {
      const v = computeNodeVisual(undefined, 'n', options(mode), measure)
      expect(v.width).toBeGreaterThan(0)
      expect(v.height).toBeGreaterThan(0)
    }
  })
})
