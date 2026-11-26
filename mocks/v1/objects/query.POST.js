// Asset lookups (an object's asset, a node's component assets) read the asset links of the
// fixtures; every other query gets the fixed result set in query.json.
import fs from 'node:fs'
import { linkedAssets } from '../_lib/assets.js'

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
  if (linked && query.includes('componentSerial')) {
    return linkedAssets(Number(linked[1]), { components: query.includes('serial != ""') })
  }
  return JSON.parse(fs.readFileSync(STATIC_RESULT, 'utf-8'))
}
