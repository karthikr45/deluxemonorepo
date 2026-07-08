import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Minimal seed so the dashboard shows something on first boot. Safe to re-run.
async function main() {
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      phone: '+27821234567',
      firstName: 'Alice',
      lastName: 'Nkosi',
      shopifyCustomerId: 'gid://shopify/Customer/1001',
      zenotiGuestId: 'zen-guest-1001',
      pointsBalance: 450,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.pointsLedger.create({
    data: {
      userId: alice.id,
      delta: 450,
      balanceAfter: 450,
      source: 'SYNC',
      reference: 'initial-seed',
    },
  });

  await prisma.activityLog.create({
    data: {
      level: 'INFO',
      category: 'SYSTEM',
      message: 'Seed data loaded',
      context: { seededUsers: 1 },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', { alice: alice.id });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
