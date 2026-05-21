import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

import { loadConfig } from "../config/index.js";

export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "ChatModuleLinkPreview/1.0";

type CacheEntry = { preview: LinkPreview | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Synchronous cache read (used on message send to avoid blocking on network). */
export function getCachedLinkPreview(url: string): LinkPreview | null | undefined {
  return cacheGet(url);
}

function cacheGet(url: string): LinkPreview | null | undefined {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(url);
    return undefined;
  }
  return hit.preview;
}

function cacheSet(url: string, preview: LinkPreview | null): void {
  cache.set(url, { preview, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

export function extractFirstHttpUrl(text: string): string | null {
  const m = text.match(URL_RE);
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

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    if (n === "::1" || n === "::") return true;
    if (n.startsWith("fc") || n.startsWith("fd")) return true;
    if (n.startsWith("fe80")) return true;
    if (n.startsWith("::ffff:")) {
      const v4 = n.slice("::ffff:".length);
      if (net.isIPv4(v4)) return isPrivateIp(v4);
    }
  }
  return false;
}

async function resolveHostAllowed(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "0.0.0.0" ||
    h === "[::1]"
  ) {
    return false;
  }
  if (net.isIP(h)) {
    return !isPrivateIp(h);
  }
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(h).catch(() => [] as string[]),
      dns.resolve6(h).catch(() => [] as string[]),
    ]);
    const ips = [...v4, ...v6];
    if (ips.length === 0) return false;
    return ips.every((ip) => !isPrivateIp(ip));
  } catch {
    return false;
  }
}

function resolveRelativeUrl(base: string, href: string | undefined): string | undefined {
  if (!href?.trim()) return undefined;
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

function parseOgFromHtml(html: string, pageUrl: string): LinkPreview {
  const $ = cheerio.load(html);
  const og = (prop: string) =>
    $(`meta[property="og:${prop}"]`).attr("content") ??
    $(`meta[name="og:${prop}"]`).attr("content");
  const title =
    og("title")?.trim() ||
    $("title").first().text().trim() ||
    undefined;
  const description = og("description")?.trim() || $('meta[name="description"]').attr("content")?.trim();
  const imageUrl = resolveRelativeUrl(pageUrl, og("image")?.trim());
  const siteName = og("site_name")?.trim();
  return {
    url: pageUrl,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(siteName ? { siteName } : {}),
  };
}

async function fetchHtml(url: string, redirectsLeft: number): Promise<string | null> {
  const allowed = await resolveHostAllowed(new URL(url).hostname);
  if (!allowed) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || redirectsLeft <= 0) return null;
      const next = new URL(loc, url).href;
      return fetchHtml(next, redirectsLeft - 1);
    }

    if (!res.ok) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > MAX_BODY_BYTES) return null;
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return null;
    }
    return buf.toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch Open Graph metadata for a URL (SSRF-safe). Returns null on failure. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const cfg = loadConfig();
  if (!cfg.linkPreviewEnabled) return null;

  const cached = cacheGet(url);
  if (cached !== undefined) return cached;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const html = await fetchHtml(parsed.href, MAX_REDIRECTS);
  if (!html) {
    cacheSet(url, null);
    return null;
  }
  const preview = parseOgFromHtml(html, parsed.href);
  const hasContent = !!(preview.title || preview.description || preview.imageUrl);
  const out = hasContent ? preview : null;
  cacheSet(url, out);
  return out;
}

/** Extract first URL from text and fetch its preview. */
export async function fetchLinkPreviewForText(text: string): Promise<LinkPreview | null> {
  const url = extractFirstHttpUrl(text);
  if (!url) return null;
  return fetchLinkPreview(url);
}
