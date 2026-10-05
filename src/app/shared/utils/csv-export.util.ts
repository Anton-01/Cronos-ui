import { ImportIssue } from 'src/app/core/models/unit-catalog.models';

/** Wraps a cell in quotes and escapes `"` only when the value needs it — keeps plain cells readable. */
function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `issues` as a CSV the user can open next to the rejected `.xlsx` to fix each row. */
export function issuesToCsv(issues: ImportIssue[]): string {
  const header = ['row', 'column', 'severity', 'code', 'message'].join(',');
  const rows = issues.map((issue) =>
    [csvCell(issue.row), csvCell(issue.column), csvCell(issue.severity), csvCell(issue.code), csvCell(issue.message)].join(','),
  );
  return [header, ...rows].join('\n');
}

/** Triggers a browser "Save As" for a CSV string — UTF-8 BOM so Excel renders accents correctly. */
export function downloadCsv(content: string, fileName: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
