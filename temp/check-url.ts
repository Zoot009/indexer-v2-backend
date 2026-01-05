import prisma from "../lib/prisma";

const checkURL = async (urlID: string) => {
  const urlRecord = await prisma.url.findUnique({
    where: { id: urlID },
  });
  console.log(`Checking URL: ${urlRecord?.id} - ${urlRecord?.url}`);
}

checkURL("cmjwqxtnp0075tcwhl0i64sj6").catch((e) => {
  console.error("Unexpected error:", e);
}); 