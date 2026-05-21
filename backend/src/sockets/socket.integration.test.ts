/**
 * Run with migrated PostgreSQL:
 *   RUN_SOCKET_E2E=1 DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... npm run test:socket
 */
import type { AddressInfo } from "node:net";
import http from "node:http";

import bcrypt from "bcryptjs";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AppConfig } from "../config/index.js";
import { loadConfig, resetConfigCache } from "../config/index.js";
import { signAccessToken } from "../lib/jwt.js";
import { createLogger } from "../lib/logger.js";
import { getPrisma, initPrisma } from "../lib/prisma.js";
import { pairKeyForUserIds } from "../lib/pair-key.js";

import { initSocket } from "./index.js";

const run = process.env.RUN_SOCKET_E2E === "1";

describe.skipIf(!run)("socket.io integration", () => {
  let httpServer: http.Server;
  let ioServer: Awaited<ReturnType<typeof initSocket>>;
  let port: number;
  let config: AppConfig;
  let chatId: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let token1: string;
  let token3: string;

  function connectClient(token: string): Socket {
    return ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
    });
  }

  beforeAll(async () => {
    resetConfigCache();
    config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret-16ch",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-16ch",
      CORS_ORIGIN: "http://localhost:5173",
    });
    initPrisma(config);
    const logger = createLogger(config);
    const app = createApp({ config, logger });
    httpServer = http.createServer(app);
    ioServer = await initSocket(httpServer, config, logger);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.on("error", reject);
    });
    port = (httpServer.address() as AddressInfo).port;

    const prisma = getPrisma();
    const hash = await bcrypt.hash("pw-test-socket-12", 8);
    const suffix = Date.now();
    const u1 = await prisma.user.create({
      data: { email: `sock1-${suffix}@t.com`, passwordHash: hash, displayName: "S1" },
    });
    const u2 = await prisma.user.create({
      data: { email: `sock2-${suffix}@t.com`, passwordHash: hash, displayName: "S2" },
    });
    const u3 = await prisma.user.create({
      data: { email: `sock3-${suffix}@t.com`, passwordHash: hash, displayName: "S3" },
    });
    user1Id = u1.id;
    user2Id = u2.id;
    user3Id = u3.id;
    const dmKey = pairKeyForUserIds(user1Id, user2Id);
    const chat = await prisma.chat.create({
      data: {
        type: "DIRECT",
        dmKey,
        createdById: user1Id,
        members: {
          create: [
            { userId: user1Id, role: "OWNER" },
            { userId: user2Id, role: "MEMBER" },
          ],
        },
      },
    });
    chatId = chat.id;
    token1 = signAccessToken({ sub: user1Id }, config);
    token3 = signAccessToken({ sub: user3Id }, config);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    try {
      await prisma.chat.deleteMany({ where: { id: chatId } });
      await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id, user3Id] } } });
    } catch {
      /* best-effort cleanup */
    }
    await new Promise<void>((resolve) => {
      ioServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await prisma.$disconnect();
    resetConfigCache();
  });

  it("fails handshake with invalid token", async () => {
    const client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { token: "not-a-valid-jwt" },
      reconnection: false,
      autoConnect: false,
    });
    const err = await new Promise<Error>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("connect timeout")), 5000);
      client.on("connect_error", (e: Error) => {
        clearTimeout(t);
        resolve(e);
      });
      client.connect();
    });
    client.close();
    expect(err.message).toBeDefined();
  });

  it("chat:subscribe returns NOT_MEMBER for user not in chat", async () => {
    const client = connectClient(token3);
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      client.emit("chat:subscribe", { chatId }, (r: Record<string, unknown>) => resolve(r));
    });
    client.close();
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe("NOT_MEMBER");
  });

  it("chat:subscribe succeeds for member", async () => {
    const client = connectClient(token1);
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      client.emit("chat:subscribe", { chatId }, (r: Record<string, unknown>) => resolve(r));
    });
    client.close();
    expect(ack.ok).toBe(true);
  });

  it("message:send ack returns message", async () => {
    const client = connectClient(token1);
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      client.emit("chat:subscribe", { chatId }, (r: { ok?: boolean }) =>
        r.ok ? resolve() : reject(new Error("subscribe failed")),
      );
    });
    const clientMsgId = `sock-${Date.now()}`;
    const ack = await new Promise<Record<string, unknown>>((resolve) => {
      client.emit(
        "message:send",
        {
          chatId,
          clientMessageId: clientMsgId,
          kind: "TEXT",
          ciphertext: "dGVzdA==",
        },
        (r: Record<string, unknown>) => resolve(r),
      );
    });
    client.close();
    expect(ack.ok).toBe(true);
    const data = ack.data as { message?: { id?: string } };
    expect(data.message?.id).toBeDefined();
  });
});
