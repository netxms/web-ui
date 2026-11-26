import { linkAsset } from '../../_lib/assets.js'
import { nodeIdOf } from '../../_lib/nodeInventory.js'

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(null)
      }
    })
  })
}

export default async function (req, res) {
  return linkAsset(nodeIdOf(req), await readBody(req), res)
}
