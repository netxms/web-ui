export default async function handler(req, _res) {
  const name = req.url.split('/').at(-1).split('?')[0]
  const body = await new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(JSON.parse(data || '{}')))
  })
  return { name: decodeURIComponent(name), value: body.value ?? '' }
}
