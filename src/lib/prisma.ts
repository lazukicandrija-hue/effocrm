// Prisma client singleton - prevents multiple instances in dev
import { PrismaClient } from "@prisma/client";

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

// The smallest-tier managed Postgres intermittently drops connections (P1001) under
// shared-CPU contention — a momentary blip that would otherwise error a whole page.
// These codes are all connection-level (the query didn't run), so retrying is safe;
// the next attempt almost always succeeds within a few hundred ms.
const RETRIABLE = new Set(["P1001", "P1002", "P1017", "P2024"]);

function createClient() {
  const dbUrl = pooledDatabaseUrl();
  const base = new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            return await query(args);
          } catch (e: any) {
            lastErr = e;
            if (!RETRIABLE.has(e?.code)) throw e;
            await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          }
        }
        throw lastErr;
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
