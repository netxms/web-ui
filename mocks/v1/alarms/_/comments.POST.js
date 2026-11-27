import { addComment, alarmOfActionUrl } from '../../_lib/alarms.js'
import { readBody } from '../../_lib/eppChains.js'

export default async (req, res) => {
  const alarm = alarmOfActionUrl(req)
  const { text } = await readBody(req)
  if (!alarm) {
    res.statusCode = 404
    return { reason: 'Alarm not found' }
  }
  if (!text?.trim()) {
    res.statusCode = 400
    return { reason: 'Comment text is empty' }
  }
  res.statusCode = 201
  return addComment(alarm, text)
}
