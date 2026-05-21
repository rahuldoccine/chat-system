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

describe.skipIf(!run)("socket.io calls integration", () => {
  let httpServer: http.Server;
  let ioServer: Awaited<ReturnType<typeof initSocket>>;
  let port: number;
  let config: AppConfig;
  let chatId: string;
  let user1Id: string;
  let user2Id: string;
  let token1: string;
  let token2: string;

  function connectClient(token: string): Socket {
    return ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
    });
  }

  async function waitConnect(client: Socket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", reject);
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
      data: { email: `sockc1-${suffix}@t.com`, passwordHash: hash, displayName: "C1" },
    });
    const u2 = await prisma.user.create({
      data: { email: `sockc2-${suffix}@t.com`, passwordHash: hash, displayName: "C2" },
    });
    user1Id = u1.id;
    user2Id = u2.id;
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
    token2 = signAccessToken({ sub: user2Id }, config);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    try {
      await prisma.callLog.deleteMany({ where: { OR: [{ initiatorId: user1Id }, { peerId: user1Id }] } });
      await prisma.chat.deleteMany({ where: { id: chatId } });
      await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id] } } });
    } catch {
      /* best-effort cleanup */
    }
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await prisma.$disconnect();
    resetConfigCache();
  });

  it("offer -> answer -> ice -> end", async () => {
    const c1 = connectClient(token1);
    const c2 = connectClient(token2);
    await Promise.all([waitConnect(c1), waitConnect(c2)]);

    const incomingP = new Promise<{ callId: string; sdp: string }>((resolve) => {
      c2.on("call:incoming", (p: { callId: string; sdp: string }) => resolve(p));
    });

    // Kick off offer from c1 (we need to attach listener before emit)
    const offerAckP = new Promise<{ ok: boolean; data?: { callId?: string } }>((resolve) => {
      c1.emit(
        "call:offer",
        {
          chatId,
          peerUserId: user2Id,
          sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\n",
          deviceId: "dev1",
          media: { audio: true, video: false },
        },
        (r: { ok: boolean; data?: { callId?: string } }) => resolve(r),
      );
    });

    const ack = await offerAckP;
    expect(ack.ok).toBe(true);

    const inc = await incomingP;
    expect(inc.callId).toBeDefined();

    const answeredP = new Promise<{ callId: string; sdp: string }>((resolve) => {
      c1.on("call:answered", (p: { callId: string; sdp: string }) => resolve(p));
    });

    const answerAck = await new Promise<{ ok: boolean }>((resolve) => {
      c2.emit(
        "call:answer",
        { callId: inc.callId, sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\n", deviceId: "dev2" },
        (r: { ok: boolean }) => resolve(r),
      );
    });
    expect(answerAck.ok).toBe(true);
    const answered = await answeredP;
    expect(answered.callId).toBe(inc.callId);

    const iceP = new Promise<{ callId: string; candidate: string }>((resolve) => {
      c1.on("call:ice", (p: { callId: string; candidate: string }) => resolve(p));
    });
    const iceAck = await new Promise<{ ok: boolean }>((resolve) => {
      c2.emit("call:ice", { callId: inc.callId, candidate: "candidate:1 1 UDP 1 1.1.1.1 123 typ host" }, resolve);
    });
    expect(iceAck.ok).toBe(true);
    const ice = await iceP;
    expect(ice.callId).toBe(inc.callId);

    const endedP = new Promise<{ callId: string }>((resolve) => {
      c2.on("call:ended", (p: { callId: string }) => resolve(p));
    });
    const endAck = await new Promise<{ ok: boolean }>((resolve) => {
      c1.emit("call:end", { callId: inc.callId, reason: "done" }, resolve);
    });
    expect(endAck.ok).toBe(true);
    const ended = await endedP;
    expect(ended.callId).toBe(inc.callId);

    c1.close();
    c2.close();
  });

  it("stores VIDEO kind when video requested even if client reports videoFallback", async () => {
    const c1 = connectClient(token1);
    await waitConnect(c1);

    const ack = await new Promise<{ ok: boolean; data?: { callId?: string } }>((resolve) => {
      c1.emit(
        "call:offer",
        {
          chatId,
          peerUserId: user2Id,
          sdp: "v=0\no=- 0 0 IN IP4 127.0.0.1\ns=-\n",
          deviceId: "dev1",
          media: { audio: true, video: true },
          videoFallback: true,
        },
        (r: { ok: boolean; data?: { callId?: string } }) => resolve(r),
      );
    });
    expect(ack.ok).toBe(true);
    expect(ack.data?.callId).toBeDefined();

    const prisma = getPrisma();
    const row = await prisma.callLog.findUnique({ where: { id: ack.data!.callId! } });
    expect(row?.kind).toBe("VIDEO");
    const meta = row?.metadata as { videoFallback?: boolean } | null;
    expect(meta?.videoFallback).toBe(true);

    await prisma.callLog.delete({ where: { id: ack.data!.callId! } });
    c1.close();
  });
});

