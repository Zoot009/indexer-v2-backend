import { Prisma } from '../generated/prisma/client'

export async function applyDomainRules(
  tx: Prisma.TransactionClient,
  domainId: string,
  indexed: boolean,
  projectId: string
) {
  // Find or create project_domain junction record
  let projectDomain = await tx.project_domains.findUnique({
    where: {
      projectId_domainId: {
        projectId,
        domainId,
      },
    },
    include: {
      domains: true,
    },
  })

  if (!projectDomain) {
    // Create project_domain if it doesn't exist
    await tx.project_domains.create({
      data: {
        id: `${projectId}_${domainId}`,
        projectId,
        domainId,
        totalUrlsChecked: 0,
        indexedUrlsCount: 0,
        notIndexedCount: 0,
        updatedAt: new Date(),
      },
    })
    
    // Refetch with include to get the domains relation
    projectDomain = await tx.project_domains.findUnique({
      where: {
        projectId_domainId: {
          projectId,
          domainId,
        },
      },
      include: {
        domains: true,
      },
    })
  }

  // Store domain name for logging
  if (!projectDomain) {
    throw new Error(`Failed to create or find project domain for project ${projectId} and domain ${domainId}`)
  }
  
  const domainName = projectDomain.domains.domain

  const config = await tx.config.findFirst()

  if (!config || !config.enabled) return

  const updates: Prisma.project_domainsUpdateInput = {
    totalUrlsChecked: { increment: 1 },
    updatedAt: new Date(),
  }

  if (indexed) {
    updates.indexedUrlsCount = { increment: 1 }
  } else {
    updates.notIndexedCount = { increment: 1 }
  }

  // Apply counters
  const updatedProjectDomain = await tx.project_domains.update({
    where: {
      projectId_domainId: {
        projectId,
        domainId,
      },
    },
    data: updates,
  })

  // Apply stop rules
  if (
    config.applyWhitelistRule &&
    updatedProjectDomain.indexedUrlsCount >= config.indexedStopThreshold
  ) {
    await tx.project_domains.update({
      where: {
        projectId_domainId: {
          projectId,
          domainId,
        },
      },
      data: { isWhitelisted: true },
    })
    console.log(`[Domain] Whitelisted: ${domainName} for project ${projectId} (${updatedProjectDomain.indexedUrlsCount} indexed)`)
  }

  if (
    config.applyBlacklistRule &&
    updatedProjectDomain.totalUrlsChecked >= config.maxChecks &&
    updatedProjectDomain.indexedUrlsCount === 0
  ) {
    await tx.project_domains.update({
      where: {
        projectId_domainId: {
          projectId,
          domainId,
        },
      },
      data: {
        isBlacklisted: true,
        blacklistedAt: new Date(),
      },
    })
    console.log(`[Domain] Blacklisted: ${domainName} for project ${projectId} (${updatedProjectDomain.totalUrlsChecked} checks, 0 indexed)`)
  }
}