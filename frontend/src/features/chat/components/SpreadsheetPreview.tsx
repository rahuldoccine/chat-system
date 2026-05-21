import React, { useState } from 'react';
import type { SpreadsheetSheet } from '../utils/spreadsheetPreview';
import styles from './DocumentViewerModal.module.css';

const MAX_ROWS = 500;

type SpreadsheetPreviewProps = {
  sheets: SpreadsheetSheet[];
};

const SpreadsheetPreview: React.FC<SpreadsheetPreviewProps> = ({ sheets }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = sheets[activeIndex] ?? sheets[0];
  const rows = active?.rows ?? [];
  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <div className={styles.sheetPreview}>
      {sheets.length > 1 && (
        <div className={styles.sheetTabs} role="tablist" aria-label="Worksheets">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`${styles.sheetTab} ${index === activeIndex ? styles.sheetTabActive : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {rows.length === MAX_ROWS && (
        <p className={styles.sheetNotice}>Showing first {MAX_ROWS} rows.</p>
      )}

      <div className={styles.sheetTableWrap}>
        <table className={styles.sheetTable}>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={styles.sheetEmpty}>No data</td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: colCount }, (_, colIndex) => (
                    <td key={colIndex}>{row[colIndex] ?? ''}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SpreadsheetPreview;
