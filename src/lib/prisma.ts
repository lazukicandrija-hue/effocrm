// Prisma client singleton - prevents multiple instances in dev
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Cap the connection pool so we never exhaust the managed Postgres connection
// limit (Prisma error P2037 "too many connections"). Prisma otherwise sizes its
// pool to the host's CPU count, which can blow past DO Postgres's low ceiling
// under concurrent queries. 5 is plenty for a single small instance.
function pooledDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("connection_limit")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

const dbUrl = pooledDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
