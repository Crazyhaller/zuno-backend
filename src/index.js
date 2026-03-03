import express from 'express'
import http from 'http'
import { matchRouter } from './routes/matches.js'
import { attachWebSocketServer } from './ws/server.js'
import { securityMiddleware } from './arcjet.js'
import { commentaryRouter } from './routes/commentary.js'

const PORT = Number(process.env.PORT) || 8000
const HOST = process.env.HOST || '0.0.0.0'
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
const CORS_HEADERS =
  'Origin, X-Requested-With, Content-Type, Accept, Authorization'
const app = express()

const server = http.createServer(app)

app.use(express.json())
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', CORS_METHODS)
  res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS)

  if (CORS_ORIGIN !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  return next()
})

app.get('/', (req, res) => {
  res.json({ message: 'Express server is running.' })
})

app.use(securityMiddleware())

app.use('/matches', matchRouter)
app.use('/matches/:id/commentary', commentaryRouter)

const { broadcastMatchCreated, broadcastCommentary } =
  attachWebSocketServer(server)

app.locals.broadcastMatchCreated = broadcastMatchCreated
app.locals.broadcastCommentary = broadcastCommentary

server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`

  console.log(`Server running at ${baseUrl}`)
  console.log(`WebSocket server running at ${baseUrl.replace('http', 'ws')}/ws`)
})
