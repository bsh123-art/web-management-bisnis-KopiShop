'use client';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import { APP_NAME, formatDate } from './utils';

export interface ExportColumn<T> {
  header: string;
  /** Value extractor. Return a primitive — objects are not serialisable. */
  value: (row: T) => string | number;
}

/** Client-side XLSX export with a styled header row. */
export function exportToExcel<T>(rows: T[], columns: ExportColumn<T>[], fileName: string, sheetName = 'Data'): void {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((c) => c.value(row)));

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.header.length + 8)) }));

  for (let index = 0; index < header.length; index += 1) {
    const ref = XLSX.utils.encode_cell({ r: 0, c: index });
    const cell = sheet[ref];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '6F4E37' } },
        alignment: { vertical: 'center' },
      };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

/** Client-side PDF export in landscape with a branded header. */
export function exportToPdf<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  fileName: string,
  options: { title: string; subtitle?: string } = { title: 'Report' },
): void {
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.setTextColor(40, 30, 25);
  doc.text(options.title, 40, 44);

  doc.setFontSize(9);
  doc.setTextColor(120, 110, 105);
  const subtitle = options.subtitle ? `${options.subtitle} · ` : '';
  doc.text(`${subtitle}Generated ${formatDate(new Date(), true)} · ${APP_NAME}`, 40, 60);

  autoTable(doc, {
    startY: 78,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(c.value(row)))),
    styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
    headStyles: { fillColor: [111, 78, 55], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 244] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${fileName}.pdf`);
}
