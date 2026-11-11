import { createDataCenterObject } from './_lib/dataCenter.js'

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

// Below the demo data center's ids (2090000001...), above anything else in the fixtures.
let nextDataCenterId = 2080000001

export default async function (req, res) {
  const body = await readBody(req)

  if (!body.name || !body.class) {
    res.statusCode = 400
    return { message: 'Missing required field: name and class are required' }
  }

  if (body.name === 'fail') {
    res.statusCode = 409
    return { message: 'An object with this name already exists under the selected parent' }
  }

  // Kept, so the floor plan, power and properties views can open it; other creates are not.
  const kept = createDataCenterObject(body, nextDataCenterId)
  if (kept) {
    nextDataCenterId++
    res.statusCode = 201
    return kept
  }

  res.statusCode = 201
  return {
    id: Date.now() % 900000 + 100,
    guid: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    class: body.class,
    name: body.name,
    alias: body.alias ?? '',
    category: 0,
    customAttributes: [],
    responsibleUsers: [],
    timestamp: new Date().toISOString(),
    status: 0,
  }
}
