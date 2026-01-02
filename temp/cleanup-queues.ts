import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function cleanQueue(queueName: string) {
  console.log(`\n[cleanup] Processing queue: "${queueName}"`);
  const queue = new Queue(queueName, { connection: redis });
  
  try {
    // Get current counts
    const before = await queue.getJobCounts();
    console.log(`[cleanup] Before:`, before);
    
    // Drain the queue (removes waiting/paused jobs)
    await queue.drain();
    console.log(`[cleanup] Drained waiting/paused jobs`);
    
    // Remove repeatable jobs
    const repeatables = await queue.getRepeatableJobs();
    for (const r of repeatables) {
      await queue.removeRepeatableByKey(r.key);
    }
    if (repeatables.length > 0) {
      console.log(`[cleanup] Removed ${repeatables.length} repeatable jobs`);
    }
    
    // Obliterate all job data
    await queue.obliterate({ force: true });
    console.log(`[cleanup] Obliterated all job data`);
    
    // Get final counts
    const after = await queue.getJobCounts();
    console.log(`[cleanup] After:`, after);
    
    await queue.close();
  } catch (error) {
    console.error(`[cleanup] Error cleaning queue "${queueName}":`, error);
    await queue.close();
  }
}

async function main() {
  console.log('🧹 Starting queue cleanup...\n');
  
  // Clean both queue names (old and new) to ensure fresh start
  await cleanQueue('url-index-check');   // Old incorrect name
  await cleanQueue('urls-index-check');  // Correct name
  
  console.log('\n✅ Queue cleanup completed!');
  await redis.quit();
}

main().catch(e => {
  console.error('❌ Cleanup failed:', e);
  process.exit(1);
});
