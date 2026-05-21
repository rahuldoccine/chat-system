const REDACTED = "[redacted]" as const;

/**
 * Use for logs only. Avoid logging WebRTC SDP, ICE candidates, tokens, or ciphertext.
 * This helper replaces large/sensitive fields with placeholders.
 */
export function redactLogPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.toLowerCase();
    if (
      key.includes("sdp") ||
      key.includes("candidate") ||
      key.includes("token") ||
      key.includes("ciphertext") ||
      key.includes("wrappedprivatekeymaterial") ||
      key.includes("code")
    ) {
      out[k] = REDACTED;
      continue;
    }
    if (typeof v === "string" && v.length > 400) {
      out[k] = `[string:${v.length}]`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

