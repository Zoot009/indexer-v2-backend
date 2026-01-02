import { Queue } from "bullmq";
import redis from "./redis";

// Replace with your queue name and Redis config
const myQueue = new Queue('urls-index-check', { connection: redis });

async function viewQueueJobs() {
  // Get waiting jobs
  const waiting = await myQueue.getWaiting();
  console.log('Waiting jobs:', waiting.length);
  console.log(waiting.map(job => ({ id: job.id, data: job.data })));

  // Get active jobs
  const active = await myQueue.getActive();
  console.log('Active jobs:', active.length);
  
  // Get completed jobs
  const completed = await myQueue.getCompleted();
  console.log('Completed jobs:', completed.length);
  
  // Get failed jobs
  const failed = await myQueue.getFailed();
  console.log('Failed jobs:', failed.length);
  
  // Get delayed jobs
  const delayed = await myQueue.getDelayed();
  console.log('Delayed jobs:', delayed.length);
}

viewQueueJobs().then(() => process.exit());