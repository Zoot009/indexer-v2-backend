import prisma from '../lib/prisma'

async function fixMissingDomains() {
  console.log('🔧 Fixing URLs without domain assignments...\n')

  const urlsWithoutDomains = await prisma.url.findMany({
    where: { domainId: null },
    include: { projects: true }
  })

  console.log(`Found ${urlsWithoutDomains.length} URLs without domains\n`)

  let fixed = 0
  let failed = 0

  for (const url of urlsWithoutDomains) {
    try {
      // Extract domain from URL
      const urlObj = new URL(url.url)
      const domainName = urlObj.hostname

      console.log(`Processing ${url.url} -> domain: ${domainName}`)

      // Find or create domain (globally unique)
      let domain = await prisma.domains.findUnique({
        where: { domain: domainName }
      })

      if (!domain) {
        console.log(`  Creating new domain: ${domainName}`)
        domain = await prisma.domains.create({
          data: {
            domain: domainName,
            updatedAt: new Date(),
          }
        })
      }

      // Create project_domain junction if it doesn't exist
      const projectDomain = await prisma.project_domains.upsert({
        where: {
          projectId_domainId: {
            projectId: url.projectId,
            domainId: domain.id,
          }
        },
        update: {},
        create: {
          id: `${url.projectId}_${domain.id}`,
          projectId: url.projectId,
          domainId: domain.id,
          totalUrlsChecked: 0,
          indexedUrlsCount: 0,
          notIndexedCount: 0,
          updatedAt: new Date(),
        }
      })

      // Assign domain to URL
      await prisma.url.update({
        where: { id: url.id },
        data: { 
          domainId: domain.id,
          status: 'PENDING', // Reset to pending so it can be processed
          updatedAt: new Date(),
        }
      })

      console.log(`  ✅ Fixed URL ${url.id} -> domain ${domain.id}`)
      fixed++
    } catch (error) {
      console.error(`  ❌ Error fixing URL ${url.id}:`, error)
      failed++
    }
  }

  console.log(`\n✨ Done fixing missing domains!`)
  console.log(`   ✅ Fixed: ${fixed}`)
  console.log(`   ❌ Failed: ${failed}`)
}

fixMissingDomains()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
