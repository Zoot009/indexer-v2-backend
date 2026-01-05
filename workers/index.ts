import { Worker, Queue } from 'bullmq'
import { processUrlJob } from './processor'
import redis from '../lib/redis'
import prisma, { disconnectPrisma } from '../lib/prisma'
import { initializeStatsCache } from '../lib/stats-aggregator'

const queueName = 'urls-index-check'
const queue = new Queue(queueName, { connection: redis })

const worker = new Worker(
  queueName,
  async job => {
    await processUrlJob(job.data.urlId)
  },
  {
    connection: redis,
    concurrency: 8, // Reduced from 12 to prevent pool exhaustion (20 pool max / ~2.5 queries per job)
    limiter: {
      max: 15,        // 15 requests
      duration: 1000, // Per second
    },
    settings: {
      backoffStrategy: (attemptsMade) => {
        return Math.min(attemptsMade * 5000, 30000) // 5s, 10s, 15s, ... max 30s
      },
    },
  }
)

// Check if all jobs for a project are complete
async function checkProjectCompletion(projectId: string) {
  try {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { 
        totalUrls: true, 
        processedCount: true, 
        errorCount: true,
        status: true 
      }
    })

    if (!project || project.status !== 'PROCESSING') {
      return
    }

    const totalProcessed = project.processedCount + project.errorCount
    
    // Check if all URLs have been processed
    if (totalProcessed >= project.totalUrls) {
      const finalStatus = project.errorCount === project.totalUrls ? 'FAILED' : 'COMPLETED'
      
      await prisma.projects.update({
        where: { id: projectId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
        },
      })
      
      console.log(`\n🎯 Project ${projectId} ${finalStatus}`)
      console.log(`   Total: ${project.totalUrls} | Processed: ${project.processedCount} | Errors: ${project.errorCount}\n`)
    }
  } catch (err) {
    console.error(`[checkProjectCompletion] Error for project ${projectId}:`, err)
  }
}

// Event listeners for monitoring
worker.on('completed', async (job) => {
  console.log(`✅ Job ${job.id} completed`)
  
  // Check if this project is done
  if (job.data.urlId) {
    try {
      const url = await prisma.url.findUnique({
        where: { id: job.data.urlId },
        select: { projectId: true }
      })
      if (url?.projectId) {
        await checkProjectCompletion(url.projectId)
      }
    } catch (err) {
      console.error('[completed] Error checking project completion:', err)
    }
  }
})

worker.on('failed', async (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message)
  
  // Check if this project is done even with failures
  if (job?.data.urlId) {
    try {
      const url = await prisma.url.findUnique({
        where: { id: job.data.urlId },
        select: { projectId: true }
      })
      if (url?.projectId) {
        await checkProjectCompletion(url.projectId)
      }
    } catch (err) {
      console.error('[failed] Error checking project completion:', err)
    }
  }
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down worker gracefully...')
  await worker.close()
  await queue.close()
  await redis.quit()
  await disconnectPrisma() // Properly close database connections
  console.log('✅ Worker shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Initialize stats cache on startup
initializeStatsCache().then(() => {
  console.log('📊 Stats cache initialized')
})

console.log('🚀 Worker started with concurrency = 8')
console.log(`📊 Listening for jobs on queue: ${queueName}`)
console.log('Press Ctrl+C to stop\n')