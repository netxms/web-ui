/**
 * Floor plan overlays. Inlet temperature is diverging around 24 °C, the middle of the ASHRAE
 * recommended 18-27 °C band; rack power is sequential. Steps differ per theme so the light ends
 * stay distinct from the floor. The later overlays keep clear of the status hues, since a rack
 * in trouble is outlined in its status color on every overlay: free units are violet, alarm
 * counts neutral ink (the outline carries the severity), feed balance teal - grey - magenta.
 */

const INLET_LIGHT = ['#2a78d6', '#6da7ec', '#b7d3f6', '#e6e5e1', '#f3c4c0', '#ea807b', '#c93a39']
const INLET_DARK = ['#3987e5', '#256abf', '#184f95', '#3a3f45', '#7a2f30', '#b23c3c', '#e66767']
const POWER_LIGHT = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#104281']
const POWER_DARK = ['#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4']
const FREE_LIGHT = ['#aca1df', '#917fd7', '#795ec9', '#6040b0', '#482a89']
const FREE_DARK = ['#5b4994', '#755fbb', '#8f7ad9', '#a99be7', '#c4bdee']
const ALARMS_LIGHT = ['#e6e5e1', '#aeaca6', '#817f79', '#4f4d48']
const ALARMS_DARK = ['#3a3f45', '#686d75', '#989da5', '#cdd1d6']
const FEEDS_LIGHT = ['#008b96', '#74b8c0', '#e6e5e1', '#d793b3', '#b94f87']
const FEEDS_DARK = ['#289da9', '#086a73', '#3a3f45', '#8a4066', '#c96598']

/**
 * Legend of the feed balance overlay for a room whose racks run on these two feeds.
 *
 * @param {string} first - the feed whose share is drawn, first in sort order
 * @param {string} second
 */
export function feedBalanceLabels(first, second) {
  return [
    `${second} 65 % and above`,
    `${second} 55 – 65 %`,
    'balanced, 45 – 55 %',
    `${first} 55 – 65 %`,
    `${first} 65 % and above`,
  ]
}

/**
 * @typedef {object} ScaleOverlay
 * @property {string} id
 * @property {string} label
 * @property {string} title - legend heading
 * @property {'inlet'|'power'|'free'|'alarms'|'feedShare'} metric
 * @property {string} [tag] - system tag the metric comes from
 * @property {string} [note] - where the metric comes from, when it is not one tag
 * @property {number[]} edges - a value at an edge falls in the bin above it
 * @property {string[]} labels
 * @property {string[]} light
 * @property {string[]} dark
 */

/** @type {ScaleOverlay[]} */
export const SCALE_OVERLAYS = [
  {
    id: 'inlet',
    label: 'Inlet',
    title: 'Rack inlet temperature',
    metric: 'inlet',
    tag: 'env.temp.inlet',
    edges: [21, 22.5, 24, 25.5, 27, 30],
    labels: [
      'below 21 °C',
      '21 – 22.5',
      '22.5 – 24',
      '24 – 25.5',
      '25.5 – 27',
      '27 – 30',
      '30 °C and above',
    ],
    light: INLET_LIGHT,
    dark: INLET_DARK,
  },
  {
    id: 'power',
    label: 'Power',
    title: 'Rack power, all feeds',
    metric: 'power',
    tag: 'power.feed',
    edges: [4, 5.5, 7, 9],
    labels: ['below 4 kW', '4 – 5.5', '5.5 – 7', '7 – 9', '9 kW and above'],
    light: POWER_LIGHT,
    dark: POWER_DARK,
  },
  {
    id: 'free',
    label: 'Space',
    title: 'Free rack units',
    metric: 'free',
    note: "The rack's height less what its layout holds, devices and panels alike.",
    edges: [1, 5, 10, 20],
    labels: ['full', '1 – 4 U', '5 – 9', '10 – 19', '20 U and above'],
    light: FREE_LIGHT,
    dark: FREE_DARK,
  },
  {
    id: 'alarms',
    label: 'Alarms',
    title: 'Active alarms',
    metric: 'alarms',
    note: 'Outstanding and acknowledged alarms of the rack and of the devices in it.',
    edges: [1, 2, 4],
    labels: ['none', '1', '2 – 3', '4 and more'],
    light: ALARMS_LIGHT,
    dark: ALARMS_DARK,
  },
  {
    id: 'feeds',
    label: 'Feeds',
    title: 'Feed balance',
    metric: 'feedShare',
    note: 'Share of rack power on each feed, from DCIs tagged power.feed/<feed>. Racks without exactly two feeds have no value.',
    edges: [35, 45, 55, 65],
    labels: feedBalanceLabels('A', 'B'),
    light: FEEDS_LIGHT,
    dark: FEEDS_DARK,
  },
]

export const OVERLAY_IDS = ['status', ...SCALE_OVERLAYS.map((o) => o.id)]

/** @param {number} value @param {number[]} edges */
export function binIndex(value, edges) {
  let i = 0
  while (i < edges.length && value >= edges[i]) i++
  return i
}

/**
 * @param {ScaleOverlay} overlay
 * @param {number|null|undefined} value
 * @param {boolean} dark
 * @returns {string|null} null without a value
 */
export function scaleColor(overlay, value, dark) {
  if (value == null || !Number.isFinite(value)) return null
  return (dark ? overlay.dark : overlay.light)[binIndex(value, overlay.edges)]
}
