import { describe, expect, it } from "vitest";

import { mimeFromExtension, resolveDeclaredUploadMime } from "./upload-allowlist.js";

describe("resolveDeclaredUploadMime", () => {
  it("accepts allowed browser MIME", () => {
    expect(resolveDeclaredUploadMime("photo.jpg", "image/jpeg")).toBe("image/jpeg");
  });

  it("falls back to extension for application/octet-stream", () => {
    expect(resolveDeclaredUploadMime("report.pdf", "application/octet-stream")).toBe(
      "application/pdf",
    );
    expect(
      resolveDeclaredUploadMime(
        "data.xlsx",
        "application/octet-stream",
      ),
    ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("falls back to extension for E2EE ciphertext filenames", () => {
    expect(resolveDeclaredUploadMime("clip.mp3", "application/octet-stream")).toBe("audio/mpeg");
    expect(resolveDeclaredUploadMime("pic.png", "application/octet-stream")).toBe("image/png");
  });

  it("rejects unknown extension with octet-stream", () => {
    expect(resolveDeclaredUploadMime("malware.exe", "application/octet-stream")).toBeNull();
  });

  it("maps csv extension", () => {
    expect(mimeFromExtension("industry.csv")).toBe("text/csv");
  });
});
