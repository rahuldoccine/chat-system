/** Apply saved theme before first paint (moved from index.html for Sonar/security). */
export function applyThemeFromStorage(): void {
  try {
    const stored = localStorage.getItem('chat-theme');
    const dark =
      stored === 'dark' ||
      (stored !== 'light' &&
        globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.dataset.theme = 'dark';
    }
  } catch (err) {
    console.debug('theme bootstrap skipped', err);
  }
}
