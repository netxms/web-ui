import { patchObject } from '../_lib/objectStore.js'

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

export default async function (req, res) {
  const id = Number(req.url.split('?')[0].split('/').filter(Boolean).pop())
  const body = await readBody(req)
  const updated = patchObject(id, body)

  if (!updated) {
    res.statusCode = 404
    return { message: `Object ${id} not found` }
  }
  return updated
}
