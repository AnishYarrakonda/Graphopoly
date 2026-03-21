import JSZip from 'jszip';
import { CHARTS, type BuildParams } from './chartRegistry';

export function buildCsvString(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadChartCsv(chartId: string, params: BuildParams): void {
  const chart = CHARTS.find(c => c.id === chartId);
  if (!chart) return;
  const { headers, rows } = chart.buildCsv(params);
  downloadCsv(chart.csvFilename, buildCsvString(headers, rows));
}

export async function downloadAllCsvsAsZip(params: BuildParams): Promise<void> {
  const zip = new JSZip();
  const seen = new Set<string>();

  for (const chart of CHARTS) {
    if (seen.has(chart.csvFilename)) continue;
    seen.add(chart.csvFilename);
    const { headers, rows } = chart.buildCsv(params);
    zip.file(chart.csvFilename, buildCsvString(headers, rows));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'graphopoly_data.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
