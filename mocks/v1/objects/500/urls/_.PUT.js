function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

export default async function(req) {
  const body = await readBody(req)
  const urlId = parseInt(req.url.split('/').pop(), 10)
  return { id: urlId, url: body.url ?? '', description: body.description ?? null }
}
