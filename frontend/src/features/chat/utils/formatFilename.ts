/**
 * Shorten a filename for display while keeping the extension visible.
 * e.g. `file_example_XLSX_5000.xlsx` → `file_exam…5000.xlsx`
 */
export function truncateFilenameMiddle(name: string, maxLength = 28): string {
  if (maxLength < 10 || name.length <= maxLength) return name;

  const lastDot = name.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < name.length - 1;
  const ext = hasExt ? name.slice(lastDot) : '';
  const base = hasExt ? name.slice(0, lastDot) : name;

  const ellipsis = '…';
  const budget = maxLength - ext.length - ellipsis.length;
  if (budget < 4) return `${name.slice(0, maxLength - 1)}${ellipsis}`;

  const head = Math.ceil(budget * 0.55);
  const tail = budget - head;
  return `${base.slice(0, head)}${ellipsis}${base.slice(-tail)}${ext}`;
}
