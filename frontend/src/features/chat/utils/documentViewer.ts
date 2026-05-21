export type DocumentViewerKind = 'pdf' | 'docx' | 'csv' | 'sheet';

export function getDocumentViewerKind(
  mimetype?: string,
  filename?: string,
): DocumentViewerKind | null {
  const m = (mimetype ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  const name = (filename ?? '').toLowerCase();

  if (m === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';

  if (
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }

  if (m === 'text/csv' || name.endsWith('.csv')) return 'csv';

  if (
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx')
  ) {
    return 'sheet';
  }

  return null;
}

export function isSpreadsheetViewerKind(kind: DocumentViewerKind): kind is 'csv' | 'sheet' {
  return kind === 'csv' || kind === 'sheet';
}
