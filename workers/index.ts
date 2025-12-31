import { prisma } from "../lib/prisma"

const main = async () => {
  const project = await prisma.projects.findFirst({
    where:{
      name: "Example Project",
    }
  })

  console.log("Project:", project)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})