import { describe, expect, it } from "vitest";

import { messagePreviewBody } from "./push-notification-content.js";

describe("messagePreviewBody", () => {
  it("returns ciphertext for text messages", () => {
    expect(
      messagePreviewBody(
        { kind: "TEXT", ciphertext: "hi there", contentMeta: null },
        false,
      ),
    ).toBe("hi there");
  });

  it("returns voice label for voice notes", () => {
    expect(
      messagePreviewBody(
        { kind: "FILE", ciphertext: "", contentMeta: { voiceNote: true } },
        false,
      ),
    ).toBe("Voice message");
  });

  it("returns generic label for E2EE DMs", () => {
    expect(
      messagePreviewBody(
        { kind: "TEXT", ciphertext: "encrypted-blob", contentMeta: { e2eeVersion: 1 } },
        true,
      ),
    ).toBe("New message");
  });

  it("returns Photo for image kind without caption", () => {
    expect(
      messagePreviewBody({ kind: "IMAGE", ciphertext: null, contentMeta: null }, false),
    ).toBe("Photo");
  });
});
