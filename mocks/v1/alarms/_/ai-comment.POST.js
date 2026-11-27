import { alarmOfActionUrl, suggestedComment } from '../../_lib/alarms.js'

/** Slow enough to show the waiting state; the server's answer takes seconds to minutes. */
const DELAY_MS = 1500

export default async (req, res) => {
  const alarm = alarmOfActionUrl(req)
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
  if (!alarm) {
    res.statusCode = 404
    return { reason: 'Alarm not found' }
  }
  return { comment: suggestedComment(alarm) }
}
