import { changeState } from '../../_lib/alarms.js'

export default (req, res) => changeState(req, res, 'acknowledged')
