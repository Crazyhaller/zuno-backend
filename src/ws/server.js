import { WebSocket, WebSocketServer } from 'ws'
import { wsArcjet } from '../arcjet.js'

const matchSubscribers = new Map()

function normalizeMatchId(value) {
  const parsed = Number.parseInt(String(value), 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function subscribe(matchId, socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set())
  }

  matchSubscribers.get(matchId).add(socket)
}

function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId)

  if (!subscribers) {
    return
  }

  subscribers.delete(socket)

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId)
  }
}

function cleanupSubscriptions(socket) {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket)
  }

  socket.subscriptions.clear()
}

function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId)
  if (!subscribers || subscribers.size === 0) return

  const message = JSON.stringify(payload)

  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  try {
    socket.send(JSON.stringify(payload))
  } catch (err) {
    console.error('Failed to send message to client:', err)
  }
}

function broadcastToAll(wss, payload) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue
    }

    try {
      client.send(JSON.stringify(payload))
    } catch (err) {
      console.error('Failed to broadcast to a client:', err)
    }
  }
}

function handleMessage(socket, data) {
  let message

  try {
    message = JSON.parse(data.toString())
  } catch {
    sendJson(socket, { type: 'error', message: 'Invalid JSON' })
    return
  }

  if (message?.type === 'setSubscriptions' && Array.isArray(message.matchIds)) {
    cleanupSubscriptions(socket)

    const normalizedMatchIds = []
    for (const rawMatchId of message.matchIds) {
      const normalizedMatchId = normalizeMatchId(rawMatchId)

      if (normalizedMatchId === null) {
        continue
      }

      subscribe(normalizedMatchId, socket)
      socket.subscriptions.add(normalizedMatchId)
      normalizedMatchIds.push(normalizedMatchId)
    }

    sendJson(socket, { type: 'subscriptions', matchIds: normalizedMatchIds })
    return
  }

  if (message?.type === 'subscribe') {
    const matchId = normalizeMatchId(message.matchId)
    if (matchId === null) {
      sendJson(socket, { type: 'error', message: 'Invalid matchId' })
      return
    }

    subscribe(matchId, socket)
    socket.subscriptions.add(matchId)
    sendJson(socket, { type: 'subscribed', matchId })
    return
  }

  if (message?.type === 'unsubscribe') {
    const matchId = normalizeMatchId(message.matchId)
    if (matchId === null) {
      sendJson(socket, { type: 'error', message: 'Invalid matchId' })
      return
    }

    unsubscribe(matchId, socket)
    socket.subscriptions.delete(matchId)
    sendJson(socket, { type: 'unsubscribed', matchId })
  }
}

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024 * 2,
  })

  server.on('upgrade', async (req, socket, head) => {
    const corsOrigin = process.env.CORS_ORIGIN || '*'
    if (!req.headers.origin && corsOrigin !== '*') {
      req.headers.origin = corsOrigin
    }

    let pathname

    try {
      pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req)

        if (decision.isDenied()) {
          if (decision.reason.isRateLimit()) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n')
          } else {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          }
          socket.destroy()
          return
        }
      } catch (e) {
        console.error('WS upgrade protection error', e)
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
        socket.destroy()
        return
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', async (socket, req) => {
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })

    socket.subscriptions = new Set()

    sendJson(socket, { type: 'welcome' })

    socket.on('message', (data) => {
      handleMessage(socket, data)
    })

    socket.on('error', (err) => {
      socket.terminate()
    })

    socket.on('close', () => {
      cleanupSubscriptions(socket)
    })

    socket.on('error', console.error)
  })

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  wss.on('close', () => {
    clearInterval(interval)
  })

  function broadcastMatchCreated(match) {
    broadcastToAll(wss, { type: 'match_created', data: match })
  }

  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, { type: 'commentary', data: comment })
  }

  return {
    broadcastMatchCreated,
    broadcastCommentary,
  }
}
