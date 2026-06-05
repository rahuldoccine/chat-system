import { describe, expect, it } from "vitest";

import { extractUploadRefsFromContentMeta, isSafeStorageKey } from "./upload-cleanup.js";

describe("upload-cleanup", () => {
  it("extracts single file refs", () => {
    const refs = extractUploadRefsFromContentMeta({
      uploadId: "u1",
      filename: "abc.png",
      url: "/api/v1/files/abc.png",
    });
    expect(refs.uploadIds).toEqual(["u1"]);
    expect(refs.storageKeys).toContain("abc.png");
  });

  it("extracts bundled files refs", () => {
    const refs = extractUploadRefsFromContentMeta({
      files: [
        { uploadId: "a", filename: "one.pdf" },
        { uploadId: "b", filename: "two.docx" },
      ],
    });
    expect(refs.uploadIds).toEqual(["a", "b"]);
    expect(refs.storageKeys).toEqual(["one.pdf", "two.docx"]);
  });

  it("extracts attachmentRefs files", () => {
    const refs = extractUploadRefsFromContentMeta({
      attachmentRefs: {
        files: [
          { uploadId: "u1", filename: "enc.bin", url: "/api/v1/files/enc.bin" },
          { uploadId: "u2", filename: "photo.jpg" },
        ],
      },
    });
    expect(refs.uploadIds).toEqual(["u1", "u2"]);
    expect(refs.storageKeys).toEqual(["enc.bin", "photo.jpg"]);
  });

  it("rejects unsafe storage keys", () => {
    expect(isSafeStorageKey("../etc/passwd")).toBe(false);
    expect(isSafeStorageKey("valid-key.png")).toBe(true);
  });
});
