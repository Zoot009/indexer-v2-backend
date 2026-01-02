import { prisma } from "../lib/prisma";

const indexedUrls = async (projectId: string) => {
  try {

    const projectAvailable = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { id: true }
    });

    if (!projectAvailable) {
      console.log("Project not found");
      return;
    }

    const indexedurl = await prisma.url.findMany({
      where: {
        projectId,
        isIndexed: false,
      },
      select: { url: true }
    })

    const urlArray = indexedurl.map(item => item.url);

    console.log("Indexed URLs:", urlArray);
    console.log("Total indexed URLs:", indexedurl.length);
  } catch (error) {
    console.error("Error fetching indexed URLs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

indexedUrls("cmjvl434i000030whj4cpxbxn");