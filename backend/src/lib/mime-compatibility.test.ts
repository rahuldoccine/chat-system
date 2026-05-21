import { describe, expect, it } from "vitest";

import { areMimesCompatible, resolveUploadMime } from "./mime-compatibility.js";

describe("mime-compatibility", () => {
  it("accepts exact and alias matches", () => {
    expect(areMimesCompatible("image/jpeg", "image/jpg")).toBe(true);
    expect(areMimesCompatible("image/jpeg", "image/jpeg")).toBe(true);
    expect(areMimesCompatible("audio/mpeg", "audio/mp3")).toBe(true);
  });

  it("accepts webm audio vs video container labels", () => {
    expect(areMimesCompatible("video/webm", "audio/webm")).toBe(true);
    expect(areMimesCompatible("video/webm", "video/webm")).toBe(true);
  });

  it("accepts office zip/cfb sniff results", () => {
    expect(
      areMimesCompatible(
        "application/zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(areMimesCompatible("application/x-cfb", "application/msword")).toBe(true);
  });

  it("rejects unrelated types", () => {
    expect(areMimesCompatible("image/png", "application/pdf")).toBe(false);
    expect(areMimesCompatible("application/zip", "image/jpeg")).toBe(false);
  });

  it("resolveUploadMime prefers declared when compatible", () => {
    expect(resolveUploadMime("image/jpeg", "image/jpg")).toEqual({
      mime: "image/jpeg",
      compatible: true,
    });
  });

  it("resolveUploadMime uses sniff for webm audio mismatch", () => {
    const r = resolveUploadMime("video/webm", "audio/webm");
    expect(r.compatible).toBe(true);
    expect(r.mime).toBe("video/webm");
  });

  it("accepts jpeg declared with webp content (wrong extension)", () => {
    expect(areMimesCompatible("image/webp", "image/jpeg")).toBe(true);
    const r = resolveUploadMime("image/webp", "image/jpeg");
    expect(r.compatible).toBe(true);
    expect(r.mime).toBe("image/webp");
  });
});
