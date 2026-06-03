import { PrismaClient } from "@prisma/client";

import type { AppConfig } from "../config/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient | undefined;

export function initPrisma(config: AppConfig): PrismaClient {
  const logLevels: ("query" | "info" | "warn" | "error")[] = config.isDev
    ? ["warn", "error"]
    : ["error"];

  prisma ??=
    globalForPrisma.prisma ??
    new PrismaClient({
      log: logLevels,
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });

  if (config.isDev) {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("PrismaClient not initialized; call initPrisma first");
  }
  return prisma;
}
