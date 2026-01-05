import prisma from "../lib/prisma";

// async function main() {
//   const totalUrls = await prisma.url.count();
//   const urlsWithoutDomain = await prisma.url.count({
//     where: { domainId: null }
//   });
//   const urlsWithDomain = await prisma.url.count({
//     where: { domainId: { not: null } }
//   });

//   console.log(`Total URLs: ${totalUrls}`);
//   console.log(`URLs with domainId: ${urlsWithDomain}`);
//   console.log(`URLs WITHOUT domainId: ${urlsWithoutDomain}`);

//   if (urlsWithoutDomain > 0) {
//     console.log('\nSample URLs missing domainId:');
//     const samples = await prisma.url.findMany({
//       where: { domainId: null },
//       take: 5,
//       select: { id: true, url: true, status: true }
//     });
//     console.table(samples);
//   }

//   // Check pending URLs
//   const pendingUrls = await prisma.url.count({
//     where: { status: 'PENDING' }
//   });
//   const pendingWithDomain = await prisma.url.count({
//     where: { status: 'PENDING', domainId: { not: null } }
//   });
  
//   console.log(`\nPENDING URLs: ${pendingUrls}`);
//   console.log(`PENDING URLs with domainId: ${pendingWithDomain}`);
//   console.log(`PENDING URLs WITHOUT domainId: ${pendingUrls - pendingWithDomain}`);
// }

const main = async () => {
  try {
    const urlWithThisDomain = await prisma.url.findMany({
      where:{
        domainId: "cmjwxz4qr006y5swhuhsx7z1w"
      }
    })

    console.log(urlWithThisDomain.length);
  } catch (error) {
    console.log(error)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
