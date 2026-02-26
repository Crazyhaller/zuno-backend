import express from 'express'
import { matchRouter } from './routes/matches.js'

const app = express()
const PORT = 8000

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'Express server is running.' })
})

app.use('/matches', matchRouter)

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
