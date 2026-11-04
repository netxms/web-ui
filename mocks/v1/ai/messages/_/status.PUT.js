import { messageIdFromUrl, setMessageStatus } from '../../../_lib/aiMessages.js'
import { readBody } from '../../../_lib/eppChains.js'

export default async function setAiMessageStatus(req, res) {
  const { status } = await readBody(req)
  const result = setMessageStatus(messageIdFromUrl(req), status)
  if (result.error) {
    res.statusCode = result.error
    return { reason: result.reason }
  }
  return result.message
}
