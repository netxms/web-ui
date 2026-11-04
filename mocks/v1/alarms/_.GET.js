import { listAlarms } from '../_lib/alarms.js'

/** `GET /v1/alarms/{id}`: a different shape from the list, with the DCI and event details. */
export default (req, res) => {
  const id = Number(req.url.split('?')[0].split('/').at(-1))
  const alarm = listAlarms().find((entry) => entry.id === id)
  if (!alarm) {
    res.statusCode = 404
    return { message: 'Alarm not found' }
  }
  return {
    ...alarm,
    isSticky: false,
    dci: 0,
    key: '',
    originalSeverity: alarm.severity,
    eventCode: 0,
    helpDeskState: 0,
    subordinateAlarms: [],
  }
}
