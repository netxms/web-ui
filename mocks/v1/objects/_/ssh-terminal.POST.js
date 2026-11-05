// No shell behind the fixtures, so a demo answers what a server with no SSH proxy answers.
export default function (req, res) {
  res.statusCode = 503
  return { reason: 'SSH terminals are not available in this demo' }
}
