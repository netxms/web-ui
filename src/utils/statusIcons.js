import {
  Ban,
  CircleCheck,
  CircleMinus,
  FlaskConical,
  Info,
  OctagonX,
  TriangleAlert,
  createLucideIcon,
} from 'lucide-vue-next'

// Lucide has no alert diamond or question square; these reuse its `diamond` and `square` outlines
// with the glyphs of `octagon-alert` and `circle-question-mark`.
const DiamondAlert = createLucideIcon('diamond-alert', [
  [
    'path',
    {
      d: 'M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z',
      key: 'outline',
    },
  ],
  ['path', { d: 'M12 8v4', key: 'bar' }],
  ['path', { d: 'M12 16h.01', key: 'dot' }],
])
const SquareQuestionMark = createLucideIcon('square-question-mark', [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'outline' }],
  ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', key: 'hook' }],
  ['path', { d: 'M12 17h.01', key: 'dot' }],
])

/**
 * Indexed by status code (see STATUS_KEYS). Round shapes for calm levels, corners for problems,
 * so each problem level is recognizable by outline alone. Render through StatusIcon.vue, which
 * adds the palette colour.
 */
export const STATUS_ICONS = [
  CircleCheck,
  Info,
  TriangleAlert,
  DiamondAlert,
  OctagonX,
  SquareQuestionMark,
  CircleMinus,
  Ban,
  FlaskConical,
]
