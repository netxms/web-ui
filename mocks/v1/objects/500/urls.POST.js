function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

export default async function(req, res) {
  const body = await readBody(req)
  res.statusCode = 201
  return { id: Date.now() % 900000 + 100, url: body.url ?? '', description: body.description ?? null }
}
