import cytoscape from 'cytoscape'

// The layout extensions load on first use to keep them out of the map route chunk.

let colaRegistered = null
let dagreRegistered = null

function ensureCola() {
  colaRegistered ??= import('cytoscape-cola').then(({ default: cola }) => {
    cytoscape.use(cola)
  })
  return colaRegistered
}

function ensureDagre() {
  dagreRegistered ??= import('cytoscape-dagre').then(({ default: dagre }) => {
    cytoscape.use(dagre)
  })
  return dagreRegistered
}

function collectPositions(cy) {
  const positions = {}
  cy.$('node.object').forEach((n) => {
    positions[n.id()] = { ...n.position() }
  })
  return positions
}

function runLayout(cy, options) {
  return new Promise((resolve) => {
    const layout = cy.layout({ animate: false, ...options })
    layout.one('layoutstop', () => resolve(collectPositions(cy)))
    layout.run()
  })
}

/**
 * @param {cytoscape.Core} cy
 * @returns {Promise<Record<string, {x: number, y: number}>>}
 */
async function runSpringLayout(cy) {
  await ensureCola()
  return runLayout(cy, {
    name: 'cola',
    randomize: false,
    maxSimulationTime: 1500,
    nodeSpacing: 20,
    edgeLength: 120,
  })
}

/**
 * @param {cytoscape.Core} cy
 * @returns {Promise<Record<string, {x: number, y: number}>>}
 */
async function runHTreeLayout(cy) {
  await ensureDagre()
  return runLayout(cy, { name: 'dagre', rankDir: 'LR', nodeSep: 40, rankSep: 100 })
}

/**
 * @param {cytoscape.Core} cy
 * @returns {Promise<Record<string, {x: number, y: number}>>}
 */
async function runVTreeLayout(cy) {
  await ensureDagre()
  return runLayout(cy, { name: 'dagre', rankDir: 'TB', nodeSep: 40, rankSep: 100 })
}

/**
 * @param {cytoscape.Core} cy
 * @returns {Promise<Record<string, {x: number, y: number}>>}
 */
function runRadialLayout(cy) {
  return runLayout(cy, {
    name: 'concentric',
    concentric: (n) => n.degree(),
    levelWidth: () => 2,
    minNodeSpacing: 40,
  })
}

export const LAYOUT_RUNNERS = {
  spring: runSpringLayout,
  htree: runHTreeLayout,
  vtree: runVTreeLayout,
  radial: runRadialLayout,
}
