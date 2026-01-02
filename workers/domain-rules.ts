import { Prisma } from '../generated/prisma/client'

export async function applyDomainRules(
  tx: Prisma.TransactionClient,
  domainId: string,
  indexed: boolean,
  projectId: string
) {
  const domain = await tx.domains.findUnique({
    where: { id: domainId },
  })

  if (!domain) return

  const config = await tx.config.findFirst()

  if (!config || !config.enabled) return

  const updates: Prisma.domainsUpdateInput = {
    totalUrlsChecked: { increment: 1 },
  }

  if (indexed) {
    updates.indexedUrlsCount = { increment: 1 }
  } else {
    updates.notIndexedCount = { increment: 1 }
  }

  // Apply counters
  const updatedDomain = await tx.domains.update({
    where: { id: domainId },
    data: updates,
  })

  // Apply stop rules
  if (
    config.applyWhitelistRule &&
    updatedDomain.indexedUrlsCount >= config.indexedStopThreshold
  ) {
    await tx.domains.update({
      where: { id: domainId },
      data: { isWhitelisted: true },
    })
    console.log(`[Domain] Whitelisted: ${updatedDomain.domain} (${updatedDomain.indexedUrlsCount} indexed)`)
  }

  if (
    config.applyBlacklistRule &&
    updatedDomain.totalUrlsChecked >= config.maxChecks &&
    updatedDomain.indexedUrlsCount === 0
  ) {
    await tx.domains.update({
      where: { id: domainId },
      data: {
        isBlacklisted: true,
        blacklistedAt: new Date(),
      },
    })
    console.log(`[Domain] Blacklisted: ${updatedDomain.domain} (${updatedDomain.totalUrlsChecked} checks, 0 indexed)`)
  }
}