import prisma from './prisma'
import { publishStatsUpdate } from './events'

// In-memory stats cache
interface StatsCache {
  global: {
    totalProcessed: number
    indexedCount: number
    notIndexedCount: number
    errorCount: number
  }
  projects: Map<string, {
    totalProcessed: number
    indexedCount: number
    notIndexedCount: number
    errorCount: number
  }>
}

const statsCache: StatsCache = {
  global: {
    totalProcessed: 0,
    indexedCount: 0,
    notIndexedCount: 0,
    errorCount: 0,
  },
  projects: new Map(),
}

// Initialize cache from database
export async function initializeStatsCache() {
  const projects = await prisma.projects.findMany({
    select: {
      id: true,
      processedCount: true,
      indexedCount: true,
      notIndexedCount: true,
      errorCount: true,
    },
  })

  let globalProcessed = 0
  let globalIndexed = 0
  let globalNotIndexed = 0
  let globalError = 0

  for (const project of projects) {
    statsCache.projects.set(project.id, {
      totalProcessed: project.processedCount,
      indexedCount: project.indexedCount,
      notIndexedCount: project.notIndexedCount,
      errorCount: project.errorCount,
    })

    globalProcessed += project.processedCount
    globalIndexed += project.indexedCount
    globalNotIndexed += project.notIndexedCount
    globalError += project.errorCount
  }

  statsCache.global = {
    totalProcessed: globalProcessed,
    indexedCount: globalIndexed,
    notIndexedCount: globalNotIndexed,
    errorCount: globalError,
  }

  console.log('[Stats] Cache initialized:', statsCache.global)
}

// Increment stats in cache and publish
export async function incrementStats(
  projectId: string,
  type: 'indexed' | 'notIndexed' | 'error'
) {
  // Update project stats
  if (!statsCache.projects.has(projectId)) {
    statsCache.projects.set(projectId, {
      totalProcessed: 0,
      indexedCount: 0,
      notIndexedCount: 0,
      errorCount: 0,
    })
  }

  const projectStats = statsCache.projects.get(projectId)!
  projectStats.totalProcessed++
  
  if (type === 'indexed') projectStats.indexedCount++
  else if (type === 'notIndexed') projectStats.notIndexedCount++
  else if (type === 'error') projectStats.errorCount++

  // Update global stats
  statsCache.global.totalProcessed++
  if (type === 'indexed') statsCache.global.indexedCount++
  else if (type === 'notIndexed') statsCache.global.notIndexedCount++
  else if (type === 'error') statsCache.global.errorCount++

  // Publish updates
  await Promise.all([
    publishStatsUpdate({
      projectId,
      ...projectStats,
      timestamp: Date.now(),
    }),
    publishStatsUpdate({
      ...statsCache.global,
      timestamp: Date.now(),
    }),
  ])
}

// Get current stats
export function getStats(projectId?: string) {
  if (projectId) {
    return statsCache.projects.get(projectId) || {
      totalProcessed: 0,
      indexedCount: 0,
      notIndexedCount: 0,
      errorCount: 0,
    }
  }
  return statsCache.global
}
