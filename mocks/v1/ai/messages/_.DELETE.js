import { deleteMessage, messageIdFromUrl } from '../../_lib/aiMessages.js'

export default function deleteAiMessage(req, res) {
  if (!deleteMessage(messageIdFromUrl(req))) {
    res.statusCode = 404
    return { reason: 'Message not found' }
  }
  res.statusCode = 204
  res.end()
}
