import prisma from "../lib/prisma";


async function main() {
  console.log('🌱 Starting database seed...');

  // Clear existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.credit_config.deleteMany();
  await prisma.config.deleteMany();

  // Create Config
  console.log('⚙️  Creating system config...');
  const config = await prisma.config.create({
    data: {
      enabled: true,
      maxChecks: 20,
      indexedStopThreshold: 2,
      applyBlacklistRule: true,
      applyWhitelistRule: true,
      apiKey: 'test-api-key-12345',
      updatedAt: new Date(),
    },
  });
  console.log(`✅ Config created: ${config.id}`);

  // Create Credit Config
  console.log('💰 Creating credit config...');
  const creditConfig = await prisma.credit_config.create({
    data: {
      totalCredits: 1250000,
      usedCredits: 372703,
      reservedCredits: 0,
      creditsPerCheck: 10,
      updatedAt: new Date(),
    },
  });
  console.log(`✅ Credit config created: ${creditConfig.id}`);

  // Summary
  console.log('\n📈 Seed Summary:');
  console.log(`   - Config entries: 1`);
  console.log(`   - Credit config entries: 1`);
  console.log('\n✨ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
