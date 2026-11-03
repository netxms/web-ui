import { deletePassiveElement } from '../../../../_lib/passiveRackElements.js'

export default function (req, res) {
  const id = Number(req.url.split('?')[0].split('/').filter(Boolean).pop())
  deletePassiveElement(id)
  res.statusCode = 204
  return {}
}
