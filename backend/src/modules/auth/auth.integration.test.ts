/**
 * Run against a migrated PostgreSQL database:
 *   RUN_AUTH_E2E=1 DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... npm run test:integration
 */
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { loadConfig, resetConfigCache } from "../../config/index.js";
import { createLogger } from "../../lib/logger.js";
import { getPrisma, initPrisma } from "../../lib/prisma.js";

const run = process.env.RUN_AUTH_E2E === "1";

describe.skipIf(!run)("auth e2e (set RUN_AUTH_E2E=1 and migrated PostgreSQL)", () => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "e2e-password-min-12";
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    resetConfigCache();
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "e2e-access-secret-16chars",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "e2e-refresh-secret-16chars",
    });
    initPrisma(config);
    const logger = createLogger(config);
    app = createApp({ config, logger });
  });

  afterEach(() => {
    resetConfigCache();
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("register, me, refresh, logout-all", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send({ email, password });
    expect(registerRes.status).toBe(201);
    const { accessToken, refreshToken } = registerRes.body as {
      accessToken: string;
      refreshToken: string;
    };

    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.sub).toBe(registerRes.body.user.id);

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshToken as string });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeDefined();

    const out = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${refreshed.body.accessToken as string}`);
    expect(out.status).toBe(204);
  });
});
