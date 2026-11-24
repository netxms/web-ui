import cytoscape from 'cytoscape'

// The layout extensions load on first use to keep them out of the map route chunk.

let fcoseRegistered = null
let dagreRegistered = null

function ensureFcose() {
  fcoseRegistered ??= import('cytoscape-fcose').then(({ default: fcose }) => {
    cytoscape.use(fcose)
  })
  return fcoseRegistered
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
  await ensureFcose()
  // A random start: started from the current positions fcose leaves far more overlaps and runs
  // slower.
  return runLayout(cy, {
    name: 'fcose',
    quality: 'default',
    randomize: true,
    idealEdgeLength: () => 120,
    nodeSeparation: 100,
    nodeRepulsion: () => 20000,
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
