import 'dotenv/config'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import prisma from '../lib/prisma'

const redis = new IORedis(process.env.REDIS_URL!)
const queue = new Queue('urls-index-check', { connection: redis })

async function enqueuePending() {
  const urls = await prisma.url.findMany({
    where: { status: 'PENDING' },
    select: { id: true }
  })

  console.log(`Found ${urls.length} PENDING URLs`)

  for (const url of urls) {
    await queue.add('index-check', { urlId: url.id })
  }

  console.log('✅ Enqueued all URLs')
  await queue.close()
  await redis.quit()
  process.exit(0)
}

enqueuePending()
