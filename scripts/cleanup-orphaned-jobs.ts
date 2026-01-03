import { Queue } from 'bullmq'
import { prisma } from '../lib/prisma'
import redis from '../lib/redis'

const queueName = 'urls-index-check'

async function cleanupOrphanedJobs() {
  console.log('🧹 Starting cleanup of orphaned jobs...\n')

  const queue = new Queue(queueName, { connection: redis })

  try {
    // Get all jobs in the queue
    const [waiting, active, delayed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getDelayed(),
      queue.getFailed(),
    ])

    const allJobs = [...waiting, ...active, ...delayed, ...failed]
    console.log(`📊 Found ${allJobs.length} jobs in queue`)
    console.log(`   Waiting: ${waiting.length}`)
    console.log(`   Active: ${active.length}`)
    console.log(`   Delayed: ${delayed.length}`)
    console.log(`   Failed: ${failed.length}\n`)

    let removedCount = 0
    let validCount = 0

    for (const job of allJobs) {
      const urlId = job.data.urlId

      // Check if URL exists in database
      const url = await prisma.url.findUnique({
        where: { id: urlId },
        select: { id: true, status: true, domainId: true }
      })

      if (!url) {
        console.log(`❌ Removing orphaned job for deleted URL: ${urlId}`)
        await job.remove()
        removedCount++
      } else if (!url.domainId) {
        console.log(`⚠️  Removing job for URL without domain: ${urlId}`)
        await job.remove()
        // Mark URL as error
        await prisma.url.update({
          where: { id: urlId },
          data: { 
            status: 'FAILED', 
            errorMessage: 'Missing domain assignment' 
          }
        })
        removedCount++
      } else if (url.status === 'COMPLETED' || url.status === 'FAILED') {
        console.log(`✅ Removing job for already processed URL: ${urlId} (status: ${url.status})`)
        await job.remove()
        removedCount++
      } else {
        validCount++
      }
    }

    console.log(`\n✨ Cleanup complete!`)
    console.log(`   Removed: ${removedCount} jobs`)
    console.log(`   Valid: ${validCount} jobs`)

  } catch (error) {
    console.error('Error during cleanup:', error)
  } finally {
    await queue.close()
    await redis.quit()
    await prisma.$disconnect()
  }
}

cleanupOrphanedJobs()
