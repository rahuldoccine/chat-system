import { describe, expect, it } from "vitest";

import { extractFirstHttpUrl } from "./link-preview.js";

describe("extractFirstHttpUrl", () => {
  it("extracts https URL from text", () => {
    expect(extractFirstHttpUrl("see https://example.com/path ok")).toBe(
      "https://example.com/path",
    );
  });

  it("strips trailing punctuation", () => {
    expect(extractFirstHttpUrl("link: https://example.com.")).toBe("https://example.com/");
  });

  it("returns null when no URL", () => {
    expect(extractFirstHttpUrl("no links here")).toBeNull();
  });
});
