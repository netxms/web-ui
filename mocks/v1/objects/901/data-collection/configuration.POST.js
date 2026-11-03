export default async function handler(req) {
  const body = await new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(JSON.parse(data || '{}')))
  })

  const newId = Date.now() % 100000
  return {
    ...body,
    id: newId,
    guid: `mock-${newId}-${Math.random().toString(36).slice(2)}`,
    templateId: 0,
    templateItemId: 0,
    thresholds: body.thresholds ?? [],
    columns: body.columns ?? [],
  }
}
