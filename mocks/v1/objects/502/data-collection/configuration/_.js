import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const listPath = path.join(__dirname, '../configuration.json')

export default function handler(req) {
  const dciId = Number(req.url.split('/').at(-1).split('?')[0])
  const method = req.method.toUpperCase()

  const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'))

  if (method === 'GET') {
    const item = list.find((d) => d.id === dciId)
    if (!item) return null
    return item
  }

  if (method === 'PATCH') {
    return new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => (data += chunk))
      req.on('end', () => {
        const patch = JSON.parse(data || '{}')
        const item = list.find((d) => d.id === dciId)
        resolve({ ...item, ...patch, id: dciId })
      })
    })
  }

  if (method === 'DELETE') {
    return null
  }

  return null
}
