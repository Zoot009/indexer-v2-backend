import { Queue } from 'bullmq'
import { redis } from './redis'

export const urlQueue = new Queue('url-index-check', {
  connection: redis,
})
