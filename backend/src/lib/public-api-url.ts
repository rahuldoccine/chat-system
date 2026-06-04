/** Normalize OpenAPI / Swagger server base (absolute URL ending with `/api/v1`). */
export function normalizePublicApiBaseUrl(url: string): string {
  let trimmed = url.trim().replace(/\/$/g, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  const parsed = new URL(trimmed);
  let path = parsed.pathname.replace(/\/$/g, "") || "/api/v1";
  if (path === "/") {
    path = "/api/v1";
  } else if (!path.endsWith("/api/v1")) {
    path = path.endsWith("/api") ? `${path}/v1` : `${path}/api/v1`;
  }
  return `${parsed.origin}${path}`;
}
