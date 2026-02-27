import { WebSocket, WebSocketServer } from 'ws'

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

  wss.on('connection', (socket) => {
    sendJson(socket, { type: 'welcome' })

    socket.on('error', console.error)
  })

  function broadcastMatchCreated(match) {
    broadcast(wss, { type: 'match_created', data: match })
  }

  return {
    broadcastMatchCreated,
  }
}
