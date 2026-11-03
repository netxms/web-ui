function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve([]) }
    })
  })
}

export default async function(req) {
  const body = await readBody(req)
  return { dashboards: Array.isArray(body) ? body : [] }
}
