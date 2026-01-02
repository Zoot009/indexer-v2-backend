import { Queue } from 'bullmq';
import redis from '../lib/redis';

async function main() {
  const queue = new Queue('urls-index-check', { connection: redis });
  
  try {
    const counts = await queue.getJobCounts();
    console.log('Queue job counts:');
    console.table(counts);
    
    // Get some waiting jobs to inspect
    const waitingJobs = await queue.getWaiting(0, 5);
    if (waitingJobs.length > 0) {
      console.log('\nSample waiting jobs:');
      waitingJobs.forEach(job => {
        console.log(`Job ${job.id}: urlId=${job.data.urlId}`);
      });
    }
  } finally {
    await queue.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
