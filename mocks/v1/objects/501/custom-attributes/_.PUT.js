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
  const name = decodeURIComponent(req.url.split('/').pop())
  return { name, value: body.value ?? '', inheritable: body.inheritable ?? false }
}
