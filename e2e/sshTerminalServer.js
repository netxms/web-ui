// Replays the SSH terminal endpoints for the specs.
import { Buffer } from 'node:buffer'

const NODE = 502
export const BANNER = 'Welcome to the fixture'

/** Stands in for the server: answers the POST and speaks the terminal's WebSocket protocol. */
export async function fakeSshServer(page) {
  const server = {
    posts: [],
    sockets: [],
    received: [],
    closedByClient: 0,
    failNext: null,
    /** A promise that holds login answers back, to look at the page while one is pending. */
    gate: null,
    get typed() {
      return server.received
        .filter((frame) => typeof frame !== 'string')
        .map((frame) => frame.toString('utf8'))
        .join('')
    },
    get controlMessages() {
      return server.received.filter((frame) => typeof frame === 'string').map(JSON.parse)
    },
  }

  await page.route('**/api/v1/objects/*/ssh-terminal', async (route) => {
    server.posts.push(route.request().postDataJSON())
    await server.gate
    if (server.failNext) {
      const failure = server.failNext
      server.failNext = null
      await route.fulfill(failure)
      return
    }
    await route.fulfill({
      status: 201,
      json: { token: 't', expiresIn: 30, wsUrl: `/v1/ssh-terminal/t${server.posts.length}` },
    })
  })

  await page.routeWebSocket(/v1\/ssh-terminal\//, (socket) => {
    server.sockets.push(socket)
    socket.onMessage((message) => server.received.push(message))
    socket.onClose(() => server.closedByClient++)
    socket.send(JSON.stringify({ type: 'connected' }))
    socket.send(Buffer.from(`${BANNER}\r\n$ `))
  })

  return server
}

export async function openFromMenu(page) {
  await page.goto(`/infrastructure/${NODE}/status`)
  await page.getByRole('button', { name: 'Tools', exact: true }).click()
  await page.getByRole('menuitem', { name: 'SSH terminal' }).click()
}
