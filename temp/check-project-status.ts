import prisma from '../lib/prisma'

async function checkProjectStatus(projectId: string) {
  const project = await prisma.projects.findUnique({
    where: { id: projectId },
    include: {
      url: {
        select: {
          status: true,
        },
      },
    },
  })

  if (!project) {
    console.error('❌ Project not found')
    return
  }

  const urlStatuses = project.url.reduce((acc, u) => {
    acc[u.status] = (acc[u.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('\n📊 Project Status Report')
  console.log('========================')
  console.log(`Project ID: ${projectId}`)
  console.log(`Status: ${project.status}`)
  console.log(`Total URLs: ${project.totalUrls}`)
  console.log(`Processed: ${project.processedCount}`)
  console.log(`Indexed: ${project.indexedCount}`)
  console.log(`Not Indexed: ${project.notIndexedCount}`)
  console.log(`Errors: ${project.errorCount}`)
  console.log(`Credits Used: ${project.creditsUsed}`)
  
  console.log('\nURL Status Breakdown:')
  console.table(urlStatuses)

  const totalProcessed = project.processedCount + project.errorCount
  const isComplete = totalProcessed >= project.totalUrls
  
  console.log(`\n${isComplete ? '✅' : '⏳'} Processing ${isComplete ? 'Complete' : 'In Progress'}`)
  console.log(`Progress: ${totalProcessed}/${project.totalUrls} (${((totalProcessed / project.totalUrls) * 100).toFixed(1)}%)`)
  
  if (isComplete && project.status === 'PROCESSING') {
    console.log('\n⚠️  All URLs processed but project status still PROCESSING')
    console.log('Run: npx tsx temp/fix-project-status.ts <projectId>')
  }
}

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: npx tsx temp/check-project-status.ts <projectId>')
  process.exit(1)
}

checkProjectStatus(projectId)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
