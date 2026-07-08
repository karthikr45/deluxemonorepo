import { PrismaClient } from '@prisma/client';

// Re-export everything Prisma generates (models, enums, input types) so apps
// import a single `@deluxe/db` rather than reaching into @prisma/client.
export * from '@prisma/client';

// Singleton PrismaClient. Guards against exhausting connections during dev
// hot-reload (Next.js / Nest watch mode) by caching on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
