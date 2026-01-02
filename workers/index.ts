import { Worker } from 'bullmq'
import { processUrlJob } from './processor'
import redis from '../lib/redis'

const worker = new Worker(
  'urls-index-check',
  async job => {
    await processUrlJob(job.data.urlId)
  },
  {
    connection: redis,
    concurrency: 12, // 🔥 scrape.do limit
    settings: {
      backoffStrategy: (attemptsMade) => {
        return Math.min(attemptsMade * 5000, 30000) // 5s, 10s, 15s, ... max 30s
      },
    },
  }
)

// Event listeners for monitoring
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down worker gracefully...')
  await worker.close()
  await redis.quit()
  console.log('✅ Worker shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('🚀 Worker started with concurrency = 15')
console.log('📊 Listening for jobs on queue: urls-index-check')
console.log('Press Ctrl+C to stop\n')