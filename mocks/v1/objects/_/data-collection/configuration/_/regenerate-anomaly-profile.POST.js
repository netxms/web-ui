// The server answers 202 with no body and trains in the background.
export default function (req, res) {
  res.statusCode = 202
  res.end()
}
