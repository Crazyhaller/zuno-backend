import { WebSocket, WebSocketServer } from 'ws'
import { wsArcjet } from '../arcjet.js'

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

function broadcast(wss, payload) {
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

export function attachWebSocketServer(server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 1024 * 1024 * 2, // 2MB
  })

  wss.on('connection', async (socket, req) => {
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req)

        if (decision.isDenied()) {
          if (decision.reason.isRateLimit()) {
            const code = decision.reason.isRateLimit() ? 1013 : 1008
            const reason = decision.reason.isRateLimit()
              ? 'Too Many Requests'
              : 'Forbidden'
            socket.close(code, reason)
            return
          }
        }
      } catch (error) {
        console.error('WebSocket connection blocked by Arcjet:', error)
        socket.close(1013, 'Service Unavailable')
        return
      }
    }

    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })
    sendJson(socket, { type: 'welcome' })

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
    broadcast(wss, { type: 'match_created', data: match })
  }

  return {
    broadcastMatchCreated,
  }
}
