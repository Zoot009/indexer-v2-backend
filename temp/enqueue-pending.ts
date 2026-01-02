import { Queue } from 'bullmq';
import redis from '../lib/redis';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('[enqueue] Starting...');
  
  const queue = new Queue('urls-index-check', { connection: redis });
  
  try {
    // Find all pending URLs
    const pendingUrls = await prisma.url.findMany({
      where: { status: 'PENDING' },
      select: { id: true, url: true }
    });
    
    console.log(`[enqueue] Found ${pendingUrls.length} PENDING URLs in database`);
    
    if (pendingUrls.length === 0) {
      console.log('[enqueue] No pending URLs to enqueue');
      return;
    }
    
    // Add jobs to queue
    let added = 0;
    for (const urlRecord of pendingUrls) {
      await queue.add('check-url', { urlId: urlRecord.id }, {
        removeOnComplete: 1000, // keep last 1000 completed
        removeOnFail: 5000,     // keep last 5000 failed
      });
      added++;
      if (added % 100 === 0) {
        console.log(`[enqueue] Progress: ${added}/${pendingUrls.length}`);
      }
    }
    
    console.log(`[enqueue] Successfully enqueued ${added} jobs`);
    
    const counts = await queue.getJobCounts();
    console.log('[enqueue] Queue status:');
    console.table(counts);
    
  } finally {
    await queue.close();
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('[enqueue] Error:', e);
  process.exit(1);
});
