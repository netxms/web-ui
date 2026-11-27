import { alarmOfActionUrl, commentsOf } from '../../_lib/alarms.js'

export default (req, res) => {
  const alarm = alarmOfActionUrl(req)
  if (!alarm) {
    res.statusCode = 404
    return { reason: 'Alarm not found' }
  }
  return commentsOf(alarm)
}
