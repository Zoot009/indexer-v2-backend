import { Queue } from 'bullmq';
import redis from '../lib/redis';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('[enqueue] Starting safe enqueue process...\n');
  
  const queue = new Queue('urls-index-check', { connection: redis });
  
  try {
    // Find all pending URLs WITH domains
    const pendingUrls = await prisma.url.findMany({
      where: { 
        status: 'PENDING',
        domainId: { not: null } // ✅ Only URLs with assigned domains
      },
      select: { id: true, url: true, domainId: true }
    });
    
    // Find URLs without domains (to report)
    const urlsWithoutDomains = await prisma.url.findMany({
      where: {
        status: 'PENDING',
        domainId: null
      },
      select: { id: true, url: true }
    });

    console.log(`📊 URL Status:`);
    console.log(`   ✅ Pending with domains: ${pendingUrls.length}`);
    console.log(`   ⚠️  Pending without domains: ${urlsWithoutDomains.length}\n`);
    
    // Mark URLs without domains as ERROR
    if (urlsWithoutDomains.length > 0) {
      console.log(`⚠️  Marking ${urlsWithoutDomains.length} URLs without domains as ERROR...`);
      await prisma.url.updateMany({
        where: {
          status: 'PENDING',
          domainId: null
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Missing domain assignment',
          checkedAt: new Date()
        }
      });
      console.log(`✅ Updated ${urlsWithoutDomains.length} URLs\n`);
    }

    if (pendingUrls.length === 0) {
      console.log('ℹ️  No valid pending URLs to enqueue');
      return;
    }
    
    // Add jobs to queue in batches for better performance
    console.log(`🚀 Enqueueing ${pendingUrls.length} jobs...\n`);
    
    const batchSize = 100;
    let added = 0;
    
    for (let i = 0; i < pendingUrls.length; i += batchSize) {
      const batch = pendingUrls.slice(i, i + batchSize);
      
      const jobs = batch.map(urlRecord => ({
        name: 'check-url',
        data: { urlId: urlRecord.id },
        opts: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        }
      }));
      
      await queue.addBulk(jobs);
      added += batch.length;
      
      console.log(`   Progress: ${added}/${pendingUrls.length} (${Math.round(added/pendingUrls.length*100)}%)`);
    }
    
    console.log(`\n✅ Successfully enqueued ${added} jobs\n`);
    
    const counts = await queue.getJobCounts();
    console.log('📊 Queue status:');
    console.table(counts);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await queue.close();
    await redis.quit();
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('[enqueue] Fatal error:', e);
  process.exit(1);
});
