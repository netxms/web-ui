// The Hardware Inventory asset lookup gets the fixture component assets; every other query the
// fixed result set in query.json.
import fs from 'node:fs'
import { componentAssets } from '../_lib/nodeInventory.js'

const STATIC_RESULT = new URL('./query.json', import.meta.url)

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
        resolve({})
      }
    })
  })
}

export default async function (req) {
  const { query = '' } = await readBody(req)
  const linked = /\$object->linkedObjectId == (\d+)/.exec(query)
  if (linked && query.includes('componentSerial')) return componentAssets(Number(linked[1]))
  return JSON.parse(fs.readFileSync(STATIC_RESULT, 'utf-8'))
}
