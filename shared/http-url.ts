const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

export function extractFirstHttpUrl(text: string): string | null {
  const m = URL_RE.exec(text);
  if (!m) return null;
  let raw = m[0];
  while (/[.,;:!?)]$/.test(raw)) raw = raw.slice(0, -1);
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}
