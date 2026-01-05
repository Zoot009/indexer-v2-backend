import prisma from '../lib/prisma'
import { applyDomainRules } from './domain-rules'
import { checkUrlIndexing } from './scrape'
import { publishUrlProcessed } from '../lib/events'
import { incrementStats } from '../lib/stats-aggregator'
import { UrlStatus } from '../generated/prisma/enums'

async function consumeCredits(projectId: string, amount: number) {
  const config = await prisma.credit_config.findFirst()
  if (!config) throw new Error('Credit config not found')

  const availableCredits = config.totalCredits - config.usedCredits - config.reservedCredits
  if (availableCredits < amount) {
    throw new Error(`Insufficient credits: ${availableCredits} available, ${amount} required`)
  }

  await prisma.credit_config.update({
    where: { id: config.id },
    data: { usedCredits: { increment: amount } },
  })

  await prisma.credit_logs.create({
    data: {
      amount,
      operation: 'CONSUMPTION',
      balanceAfter: config.totalCredits - config.usedCredits - amount,
      description: 'URL index check',
      projectId,
    },
  })
}

export async function processUrlJob(urlId: string) {
  const startTs = Date.now()
  console.log(`[Job][start] Processing URL=${urlId} at ${new Date(startTs).toISOString()}`)

  try {
    // 1️⃣ Claim URL
    const claimed = await prisma.url.updateMany({
      where: { id: urlId, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    })

    console.log(`[Job][claim] url=${urlId} claimedCount=${claimed.count}`)
    if (claimed.count === 0) {
      console.info(`[Job][skip] URL ${urlId} already processed or claimed by another worker`)
      return // Job completes successfully - another worker handled it
    }

    // 2️⃣ Load URL + Domain + Project Domain
    console.debug(`[Job][db] Fetching URL details for ${urlId}`)
    const url = await prisma.url.findUnique({
      where: { id: urlId },
      include: { 
        domains: true, 
        projects: true 
      },
    })

    if (!url) {
      console.warn(`[Job][skip] URL ${urlId} not found in database - likely deleted. Skipping job.`)
      return // Job completes successfully but does nothing
    }

    if (!url.domains) {
      console.error(`[Job][error] URL ${urlId} missing domain assignment`)
      await prisma.url.update({
        where: { id: urlId },
        data: { 
          status: UrlStatus.FAILED, 
          errorMessage: 'Missing domain assignment',
          checkedAt: new Date()
        },
      })
      // Increment error count for project
      await prisma.projects.update({
        where: { id: url.projectId },
        data: { errorCount: { increment: 1 } }
      })
      return // Job completes but URL is marked as ERROR
    }

    console.log(`[Job][info] url=${url.url} domain=${url.domains.domain} domainId=${url.domainId} projectId=${url.projectId}`)

    // 3️⃣ Check project_domain state (no scrape yet)
    const projectDomain = url.domainId ? await prisma.project_domains.findUnique({
      where: {
        projectId_domainId: {
          projectId: url.projectId,
          domainId: url.domainId,
        },
      },
    }) : null

    if (projectDomain && (projectDomain.isBlacklisted || projectDomain.isWhitelisted)) {
      console.info(`[Job][domain] Domain ${url.domains.domain} stopped for project: blacklisted=${projectDomain.isBlacklisted} whitelisted=${projectDomain.isWhitelisted}`)

      await prisma.$transaction(async (tx) => {
        await tx.url.update({
          where: { id: urlId },
          data: {
            status: UrlStatus.COMPLETED,
            isIndexed: projectDomain.isBlacklisted ? false : true,
            errorMessage: 'DOMAIN_STOPPED',
            checkedAt: new Date(),
          },
        })

        const indexedCountIncrement = projectDomain.isWhitelisted ? 1 : 0
        const notIndexedCountIncrement = projectDomain.isBlacklisted ? 1 : 0

        await tx.projects.update({
          where: { id: url.projectId },
          data: {
            processedCount: { increment: 1 },
            notIndexedCount: { increment: notIndexedCountIncrement },
            indexedCount: { increment: indexedCountIncrement },
          },
        })
      })
      console.log(`[Job][done] Domain stopped handling complete for url=${urlId}`)
      return
    }

    // 4️⃣ Consume credits before scraping
    const creditConfig = await prisma.credit_config.findFirst()
    const creditsPerCheck = creditConfig?.creditsPerCheck || 10
    console.log(`[Job][credits] Project=${url.projectId} will consume ${creditsPerCheck} credits`) 

    try {
      await consumeCredits(url.projectId, creditsPerCheck)
      console.log('[Job][credits] Consumption successful')
    } catch (error) {
      console.error(`[Job][error] Credit consumption failed for project=${url.projectId}:`, error)
      await prisma.url.update({
        where: { id: urlId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Credit consumption failed',
        },
      })
      return
    }

    // 5️⃣ Perform scrape.do request
    console.log(`[Job][scrape:start] Scraping URL: ${url.url}`)
    const scrapeStart = Date.now()
    const result = await checkUrlIndexing(url.url)
    const scrapeDuration = Date.now() - scrapeStart
    console.log(`[Job][scrape:end] Scrape finished for ${url.url} status=${result.status} durationMs=${scrapeDuration}`)

    // 6️⃣ Handle scrape errors
    if (result.status === 'ERROR') {
      console.error(`[Job][error] Scrape failed for ${url.url}: ${result.errorMessage}`)

      await prisma.$transaction(async (tx) => {
        await tx.url.update({
          where: { id: urlId },
          data: {
            status: 'FAILED',
            errorMessage: result.errorMessage,
            checkedAt: new Date(),
            checkCount: { increment: 1 },
            updatedAt: new Date(),
          },
        })

        await tx.projects.update({
          where: { id: url.projectId },
          data: {
            processedCount: { increment: 1 },
            errorCount: { increment: 1 },
            creditsUsed: { increment: creditsPerCheck },
          },
        })
      })

      // Emit event for error
      await incrementStats(url.projectId, 'error')
      await publishUrlProcessed({
        urlId,
        projectId: url.projectId,
        isIndexed: false,
        status: 'FAILED',
        timestamp: Date.now(),
      })
      return
    }

    const indexed = result.status === 'INDEXED'
    console.log(`[Job][result] URL ${url.url} - ${indexed ? 'INDEXED' : 'NOT_INDEXED'}`)

    // 7️⃣ Transaction: update URL + Domain + Project counters atomically
    const domainId = url.domainId
    const projectId = url.projectId
    console.log('[Job][tx] Beginning DB transaction to persist results')

    await prisma.$transaction(async (tx) => {
      await tx.url.update({
        where: { id: urlId },
        data: {
          status: 'COMPLETED',
          isIndexed: indexed,
          checkedAt: new Date(),
          checkCount: { increment: 1 },
        },
      })

      await tx.projects.update({
        where: { id: projectId },
        data: {
          processedCount: { increment: 1 },
          indexedCount: indexed ? { increment: 1 } : undefined,
          notIndexedCount: !indexed ? { increment: 1 } : undefined,
          creditsUsed: { increment: creditsPerCheck },
        },
      })

      if (domainId) {
        await applyDomainRules(tx, domainId, indexed, projectId)
      }
    })

    // Emit real-time event
    await incrementStats(url.projectId, indexed ? 'indexed' : 'notIndexed')
    await publishUrlProcessed({
      urlId,
      projectId: url.projectId,
      isIndexed: indexed,
      status: 'COMPLETED',
      timestamp: Date.now(),
    })

    const totalDuration = Date.now() - startTs
    console.log(`[Job][done] Completed URL=${urlId} totalDurationMs=${totalDuration}`)
  } catch (err) {
    console.error(`[Job][fatal] Unexpected error processing url=${urlId}:`, err)
    try {
      await prisma.url.update({
        where: { id: urlId },
        data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) },
      })
    } catch (updErr) {
      console.warn('[Job][fatal] Failed to mark URL as FAILED after error:', updErr)
    }
  }
}