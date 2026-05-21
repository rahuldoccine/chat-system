#!/usr/bin/env node
/**
 * Stub for self-hosted maintenance: find files under UPLOAD_DIR that have no matching
 * `UploadedFile.storageKey` row, then delete (dry-run first).
 *
 * Implement with Prisma + fs when you are ready; run only on the app host with correct DATABASE_URL.
 */
console.log(
  "[cleanup-orphan-uploads] Stub: list files in UPLOAD_DIR, LEFT JOIN UploadedFile on storageKey, delete orphans after dry-run.",
);
process.exit(0);
