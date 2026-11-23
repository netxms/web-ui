// Succeeds, except terminating PID 1, which the agent refuses as a real one would.
function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
  })
}

export default async function (req, res) {
  const { command } = await readBody(req)
  if (!command) {
    res.statusCode = 400
    return { reason: 'Command is missing' }
  }
  if (command === 'Process.Terminate 1') {
    res.statusCode = 500
    return { reason: 'Agent error', agentErrorCode: 900, agentErrorText: 'Access denied' }
  }
  res.statusCode = 201
  res.end()
  return null
}
