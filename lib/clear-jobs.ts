import { Queue } from 'bullmq';
import redis from './redis';

const queueName = 'urls-index-check';
const queue = new Queue(queueName, { connection: redis });

async function main() {
  console.log(`[clear-jobs] Starting — queue="${queueName}"`);
  try {
    console.log('[clear-jobs] Draining queue (removing waiting/paused jobs)...');
    await queue.drain();
    console.log('[clear-jobs] Drain completed successfully.');
    // remove repeatable jobs so they won't be re-scheduled
    try {
      const repeatables = await queue.getRepeatableJobs();
      if (repeatables.length) console.log(`[clear-jobs] Removing ${repeatables.length} repeatable jobs`);
      for (const r of repeatables) {
        try {
          await queue.removeRepeatableByKey(r.key);
          console.log(`[clear-jobs] Removed repeatable: ${r.key}`);
        } catch (remErr) {
          console.warn('[clear-jobs] Failed to remove repeatable', r.key, remErr);
        }
      }
    } catch (remAllErr) {
      console.warn('[clear-jobs] Could not list/remove repeatables:', remAllErr);
    }

    // obliterate everything related to this queue (destructive)
    try {
      console.log('[clear-jobs] Obliterating queue data (force=true)');
      await queue.obliterate({ force: true });
      console.log('[clear-jobs] Obliterate completed successfully.');
    } catch (oblErr) {
      console.warn('[clear-jobs] Obliterate failed:', oblErr);
    }
  } catch (err) {
    console.error('[clear-jobs] Error while draining queue:', err);
    process.exitCode = 1;
  } finally {
    try {
      await queue.close();
      console.log('[clear-jobs] Queue connection closed.');
    } catch (closeErr) {
      console.error('[clear-jobs] Failed to close queue connection:', closeErr);
    }
  }
}

process.on('SIGINT', async () => {
  console.log('[clear-jobs] Received SIGINT — attempting graceful shutdown');
  try {
    await queue.close();
  } catch (e) {
    /* ignore */
  }
  process.exit();
});

main().catch((err) => {
  console.error('[clear-jobs] Unexpected error:', err);
  process.exit(1);
});