import prisma from "../lib/prisma";

const id = process.argv[2];
if (!id) {
  console.error('Usage: tsx temp/inspect-url.ts <urlId>');
  process.exit(2);
}

async function main() {
  const row = await prisma.url.findUnique({
    where: { id },
    include: { domains: true, projects: true },
  });

  if (!row) {
    console.log(`No url row found for id=${id}`);
    return;
  }

  console.log('url row:');
  console.log({ id: row.id, url: row.url, status: row.status, domainId: row.domainId, projectId: row.projectId, updatedAt: row.updatedAt });
  console.log('domains relation:');
  console.log(row.domains ?? 'null');
  console.log('project relation:');
  console.log(row.projects ?? 'null');
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
