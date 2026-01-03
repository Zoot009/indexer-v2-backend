import redis from './redis'
import IORedis from 'ioredis'

// Separate subscriber connection (required for pub/sub)
const subscriber = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

export const EVENTS = {
  URL_PROCESSED: 'url:processed',
  STATS_UPDATE: 'stats:update',
} as const

export interface UrlProcessedEvent {
  urlId: string
  projectId: string
  isIndexed: boolean
  status: 'COMPLETED' | 'FAILED'
  timestamp: number
}

export interface StatsUpdateEvent {
  projectId?: string // If undefined, it's global stats
  totalProcessed: number
  indexedCount: number
  notIndexedCount: number
  errorCount: number
  timestamp: number
}

// Publish events
export async function publishUrlProcessed(data: UrlProcessedEvent) {
  await redis.publish(EVENTS.URL_PROCESSED, JSON.stringify(data))
}

export async function publishStatsUpdate(data: StatsUpdateEvent) {
  await redis.publish(EVENTS.STATS_UPDATE, JSON.stringify(data))
}

// Subscribe to events (for SSE endpoint)
export function subscribeToEvents(
  callback: (channel: string, message: string) => void
) {
  subscriber.on('message', callback)
  subscriber.subscribe(EVENTS.URL_PROCESSED, EVENTS.STATS_UPDATE)
  
  return () => {
    subscriber.unsubscribe(EVENTS.URL_PROCESSED, EVENTS.STATS_UPDATE)
  }
}
