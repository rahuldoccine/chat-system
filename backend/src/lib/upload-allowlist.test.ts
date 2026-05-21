import { describe, expect, it } from "vitest";

import {
  inferUploadKind,
  isAllowedUploadMime,
  isAudioMime,
  isDangerousOriginalName,
  safeExtensionForMime,
  shouldForceAttachmentDisposition,
} from "./upload-allowlist.js";

describe("upload-allowlist", () => {
  it("allows common image, audio, and video types", () => {
    expect(isAllowedUploadMime("image/jpeg")).toBe(true);
    expect(isAllowedUploadMime("audio/webm")).toBe(true);
    expect(isAllowedUploadMime("video/webm")).toBe(true);
    expect(isAllowedUploadMime("video/mp4")).toBe(true);
    expect(isAllowedUploadMime("application/pdf")).toBe(true);
  });

  it("rejects arbitrary types", () => {
    expect(isAllowedUploadMime("text/html")).toBe(false);
    expect(isAllowedUploadMime("application/x-msdownload")).toBe(false);
  });

  it("maps MIME to safe extension", () => {
    expect(safeExtensionForMime("image/png")).toBe(".png");
    expect(safeExtensionForMime("application/pdf")).toBe(".pdf");
  });

  it("infers kind including voice and video", () => {
    expect(inferUploadKind("image/jpeg", { voiceNote: false })).toBe("IMAGE");
    expect(inferUploadKind("audio/webm", { voiceNote: true })).toBe("VOICE");
    expect(inferUploadKind("audio/webm", { voiceNote: false })).toBe("AUDIO");
    expect(inferUploadKind("video/mp4", { voiceNote: false })).toBe("VIDEO");
    expect(inferUploadKind("video/webm", { voiceNote: true })).toBe("VOICE");
  });

  it("detects audio MIME group", () => {
    expect(isAudioMime("audio/ogg")).toBe(true);
    expect(isAudioMime("image/png")).toBe(false);
  });

  it("flags dangerous original names", () => {
    expect(isDangerousOriginalName("a.html")).toBe(true);
    expect(isDangerousOriginalName("a.svg")).toBe(true);
    expect(isDangerousOriginalName("photo.jpg")).toBe(false);
  });

  it("forces attachment for documents", () => {
    expect(shouldForceAttachmentDisposition("application/pdf")).toBe(true);
    expect(shouldForceAttachmentDisposition("image/jpeg")).toBe(false);
  });
});
