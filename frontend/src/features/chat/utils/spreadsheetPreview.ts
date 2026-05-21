import * as XLSX from 'xlsx';

export type SpreadsheetSheet = {
  name: string;
  rows: string[][];
};

const MAX_ROWS = 500;
const MAX_COLS = 40;

function trimGrid(rows: string[][]): string[][] {
  const limited = rows.slice(0, MAX_ROWS).map((row) =>
    row.slice(0, MAX_COLS).map((cell) => (cell == null ? '' : String(cell))),
  );
  return limited;
}

export async function parseSpreadsheetBlob(blob: Blob): Promise<SpreadsheetSheet[]> {
  const buffer = await blob.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  if (!workbook.SheetNames.length) {
    return [{ name: 'Sheet1', rows: [] }];
  }

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as (string | number | boolean | null)[][];

    const rows = trimGrid(
      raw.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
    );

    return { name, rows };
  });
}
