/** Safe filename for the download attribute (no path segments). */
export function safeDownloadFilename(name: string): string {
  const base = name.replaceAll(/[/\\?%*:|"<>]/g, '_').trim();
  return base || 'download';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const name = safeDownloadFilename(filename);
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

/** Fetch in the background and save with the given display name (no exposed href). */
export async function downloadFileFromUrl(
  url: string,
  filename: string,
  existingBlob?: Blob | null,
): Promise<void> {
  if (existingBlob) {
    downloadBlob(existingBlob, filename);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed');
  downloadBlob(await res.blob(), filename);
}
