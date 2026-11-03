// Lucide icons as standalone SVG for the image library (the server stores tool icons as image
// guids only). One dark ink on transparency: the console draws them as glyphs, the legacy client
// as plain dark line art. Kept apart from iconPack.js so one icon does not pull in sixty.
import { createApp, h } from 'vue'

/** No vendor name: client builds are white label. */
export const ICON_LIBRARY_CATEGORY = 'Icons'

/** The console recolours the ink; the legacy client shows it as is. */
const INK = '#334155'
/** Intrinsic size, for tools that read it (the legacy client, image pickers). */
const SIZE = 48
/** The console's own icon stroke. */
const STROKE_WIDTH = 1.75

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Renders the component once off-document: it is the only source of the path data.
 *
 * @param {object} component - a Lucide icon component
 * @returns {string}
 */
export function lucideIconSvg(component) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(component, { size: SIZE, color: INK, strokeWidth: STROKE_WIDTH }),
  })
  app.mount(host)
  const svg = host.querySelector('svg')
  svg.removeAttribute('class')
  svg.setAttribute('xmlns', SVG_NS)
  const markup = svg.outerHTML
  app.unmount()
  return markup
}
