import express from 'express'
import { subscribeToEvents, EVENTS } from '../lib/events'
import { getStats } from '../lib/stats-aggregator'

const app = express()

// SSE endpoint for real-time stats
app.get('/api/stats/stream', (req, res) => {
  const projectId = req.query.projectId as string | undefined

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*') // Adjust for production

  // Send initial stats
  const initialStats = getStats(projectId)
  res.write(`data: ${JSON.stringify(initialStats)}\n\n`)

  // Subscribe to Redis events
  const unsubscribe = subscribeToEvents((channel, message) => {
    if (channel === EVENTS.STATS_UPDATE) {
      const data = JSON.parse(message)
      
      // Send only relevant stats
      if (projectId && data.projectId === projectId) {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      } else if (!projectId && !data.projectId) {
        // Global stats
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }
    }
  })

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n')
  }, 30000)

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
})

// REST endpoint for current stats
app.get('/api/stats', async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  const stats = getStats(projectId)
  res.json(stats)
})

const PORT = process.env.API_PORT || 3001

app.listen(PORT, () => {
  console.log(`[API] Stats SSE server running on port ${PORT}`)
})

export default app
