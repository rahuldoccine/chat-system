/**
 * RUN_UPLOAD_E2E=1 DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... npm run test:uploads
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { loadConfig, resetConfigCache } from "../../config/index.js";
import { signAccessToken } from "../../lib/jwt.js";
import { pairKeyForUserIds } from "../../lib/pair-key.js";
import { createLogger } from "../../lib/logger.js";
import { getPrisma, initPrisma } from "../../lib/prisma.js";

const run = process.env.RUN_UPLOAD_E2E === "1";

/** 1x1 transparent PNG */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!run)("uploads + files e2e", () => {
  let app: ReturnType<typeof createApp>;
  let uploadDir: string;
  let chatId: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let token1: string;
  let token2: string;
  let token3: string;

  beforeAll(async () => {
    resetConfigCache();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "mernchat-upload-"));
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret-16ch",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-16ch",
      CORS_ORIGIN: "http://localhost:5173",
      UPLOAD_DIR: uploadDir,
    });
    initPrisma(config);
    const logger = createLogger(config);
    app = createApp({ config, logger });

    const prisma = getPrisma();
    const suffix = Date.now();
    const hash = await bcrypt.hash("upload-e2e-pass-12", 8);
    const u1 = await prisma.user.create({
      data: { email: `up1-${suffix}@t.com`, passwordHash: hash, displayName: "U1" },
    });
    const u2 = await prisma.user.create({
      data: { email: `up2-${suffix}@t.com`, passwordHash: hash, displayName: "U2" },
    });
    const u3 = await prisma.user.create({
      data: { email: `up3-${suffix}@t.com`, passwordHash: hash, displayName: "U3" },
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
    token2 = signAccessToken({ sub: user2Id }, config);
    token3 = signAccessToken({ sub: user3Id }, config);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    try {
      await prisma.uploadedFile.deleteMany({ where: { chatId } });
      await prisma.chat.deleteMany({ where: { id: chatId } });
      await prisma.user.deleteMany({ where: { id: { in: [user1Id, user2Id, user3Id] } } });
    } catch {
      /* ignore */
    }
    await prisma.$disconnect();
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    resetConfigCache();
  });

  /** Minimal valid-ish WAV (44-byte header) for voiceNote upload smoke test. */
  const MIN_WAV = (() => {
    const buf = Buffer.alloc(44);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(8000, 24);
    buf.writeUInt32LE(16000, 28);
    buf.writeUInt16LE(1, 32);
    buf.writeUInt16LE(8, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(0, 40);
    return buf;
  })();

  it("rejects voiceNote with non-audio file", async () => {
    const res = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${token1}`)
      .field("chatId", chatId)
      .field("voiceNote", "true")
      .attach("file", PNG_BYTES, { filename: "n.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_VOICE");
  });

  it("uploads voice note with voiceNote flag", async () => {
    const res = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${token1}`)
      .field("chatId", chatId)
      .field("voiceNote", "true")
      .attach("file", MIN_WAV, { filename: "note.wav", contentType: "audio/wav" });
    expect(res.status).toBe(201);
    const body = res.body as { kind: string; mimetype: string };
    expect(body.kind).toBe("VOICE");
    expect(body.mimetype).toContain("audio");
  });

  it("uploads chat-scoped file and member can download", async () => {
    const up = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${token1}`)
      .field("chatId", chatId)
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const key = (up.body as { key: string }).key;
    expect(key).toBeDefined();

    const dl = await request(app).get(`/api/v1/files/${key}`).set("Authorization", `Bearer ${token2}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("image/png");

    const forbidden = await request(app).get(`/api/v1/files/${key}`).set("Authorization", `Bearer ${token3}`);
    expect(forbidden.status).toBe(404);
  });

  it("hard-deletes upload from disk and DB when the message is deleted", async () => {
    const up = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${token1}`)
      .field("chatId", chatId)
      .attach("file", PNG_BYTES, { filename: "delete-me.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const body = up.body as {
      key: string;
      id: string;
      filename: string;
      originalName: string;
      mimetype: string;
      size: number;
      url: string;
    };

    const prisma = getPrisma();
    const before = await prisma.uploadedFile.findUnique({ where: { storageKey: body.key } });
    expect(before).not.toBeNull();

    const created = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Authorization", `Bearer ${token1}`)
      .send({
        clientMessageId: crypto.randomUUID(),
        kind: "IMAGE",
        ciphertext: "",
        contentMeta: {
          uploadId: body.id,
          filename: body.filename,
          originalName: body.originalName,
          mimetype: body.mimetype,
          size: body.size,
          url: body.url,
        },
      });
    expect(created.status).toBe(201);
    const messageId = (created.body as { message: { id: string } }).message.id;

    const del = await request(app)
      .delete(`/api/v1/messages/${messageId}`)
      .set("Authorization", `Bearer ${token1}`);
    expect(del.status).toBe(200);

    const after = await prisma.uploadedFile.findUnique({ where: { storageKey: body.key } });
    expect(after).toBeNull();

    await expect(fs.access(path.join(uploadDir, body.key))).rejects.toMatchObject({ code: "ENOENT" });

    const dl = await request(app)
      .get(`/api/v1/files/${body.key}`)
      .set("Authorization", `Bearer ${token2}`);
    expect(dl.status).toBe(404);
  });

  it("allows download when file is forwarded to another chat", async () => {
    const prisma = getPrisma();
    const dmKey23 = pairKeyForUserIds(user2Id, user3Id);
    const forwardChat = await prisma.chat.create({
      data: {
        type: "DIRECT",
        dmKey: dmKey23,
        createdById: user2Id,
        members: {
          create: [
            { userId: user2Id, role: "OWNER" },
            { userId: user3Id, role: "MEMBER" },
          ],
        },
      },
    });

    const up = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${token1}`)
      .field("chatId", chatId)
      .attach("file", PNG_BYTES, { filename: "fwd.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const body = up.body as {
      key: string;
      id: string;
      filename: string;
      originalName: string;
      mimetype: string;
      size: number;
      url: string;
    };

    const original = await request(app)
      .post(`/api/v1/chats/${chatId}/messages`)
      .set("Authorization", `Bearer ${token1}`)
      .send({
        clientMessageId: crypto.randomUUID(),
        kind: "IMAGE",
        ciphertext: "",
        contentMeta: {
          uploadId: body.id,
          filename: body.filename,
          originalName: body.originalName,
          mimetype: body.mimetype,
          size: body.size,
          url: body.url,
        },
      });
    expect(original.status).toBe(201);

    const forwarded = await request(app)
      .post(`/api/v1/chats/${forwardChat.id}/messages`)
      .set("Authorization", `Bearer ${token2}`)
      .send({
        clientMessageId: crypto.randomUUID(),
        kind: "IMAGE",
        ciphertext: "",
        contentMeta: {
          uploadId: body.id,
          filename: body.filename,
          originalName: body.originalName,
          mimetype: body.mimetype,
          size: body.size,
          url: body.url,
        },
      });
    expect(forwarded.status).toBe(201);

    const dl = await request(app).get(`/api/v1/files/${body.key}`).set("Authorization", `Bearer ${token3}`);
    expect(dl.status).toBe(200);

    await prisma.chat.delete({ where: { id: forwardChat.id } }).catch(() => {});
  });
});
