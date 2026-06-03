export function reportPreviewLimit(): number {
  const raw = process.env.REPORT_PREVIEW_LIMIT;
  const n = raw ? Number(raw) : 100;
  return Number.isInteger(n) && n > 0 ? Math.min(n, 500) : 100;
}

export function reportExportMaxRows(): number {
  const raw = process.env.REPORT_EXPORT_MAX_ROWS;
  const n = raw ? Number(raw) : 5000;
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : 5000;
}

export function reportExportPdfMaxRows(): number {
  const raw = process.env.REPORT_EXPORT_PDF_MAX_ROWS;
  const n = raw ? Number(raw) : 50;
  return Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50;
}

/** Fase 1: PDF oculto en UI; habilitar con REPORT_PDF_EXPORT_ENABLED=true */
export function reportPdfExportEnabled(): boolean {
  return process.env.REPORT_PDF_EXPORT_ENABLED === 'true';
}
