import { describe, expect, it } from "vitest";

import { messagePreviewBody } from "./push-notification-content.js";

describe("messagePreviewBody", () => {
  it("returns ciphertext for text messages", () => {
    expect(
      messagePreviewBody({ kind: "TEXT", ciphertext: "hi there", contentMeta: null }),
    ).toBe("hi there");
  });

  it("strips @mention tokens from text preview", () => {
    expect(
      messagePreviewBody(
        { kind: "TEXT", ciphertext: "@all hi @demotwo please check", contentMeta: null },
      ),
    ).toBe("hi please check");
  });

  it("returns voice label for voice notes", () => {
    expect(
      messagePreviewBody(
        { kind: "FILE", ciphertext: "", contentMeta: { voiceNote: true } },
      ),
    ).toBe("Voice message");
  });

  it("returns Photo for image kind without caption", () => {
    expect(
      messagePreviewBody({ kind: "IMAGE", ciphertext: null, contentMeta: null }),
    ).toBe("Photo");
  });
});
