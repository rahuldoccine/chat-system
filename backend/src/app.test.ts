import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { loadConfig, resetConfigCache } from "./config/index.js";
import { createLogger } from "./lib/logger.js";

describe("GET /api/v1/health", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("responds with 200", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/mernchat_test",
      JWT_ACCESS_SECRET: "unit-test-jwt-access-secret-16+",
      JWT_REFRESH_SECRET: "unit-test-jwt-refresh-secret-16+",
    });
    const logger = createLogger(config);
    const app = createApp({ config, logger });
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
