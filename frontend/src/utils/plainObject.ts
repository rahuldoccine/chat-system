/** Non-array object suitable for JSON metadata maps. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Safe string for IndexedDB keys (avoids implicit object stringification). */
export function idbKeyToString(key: IDBValidKey): string {
  if (typeof key === 'string') return key;
  if (typeof key === 'number') return String(key);
  if (key instanceof Date) return key.toISOString();
  if (typeof key === 'object' && key !== null && 'lower' in key && 'upper' in key) {
    const range = key as unknown as IDBKeyRange;
    return `range:${idbKeyToString(range.lower as IDBValidKey)}:${idbKeyToString(range.upper as IDBValidKey)}`;
  }
  return '';
}

/** Safe string for unknown attachment metadata fields. */
export function unknownToDisplayString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}
