import { ProjectDetailDto } from '../../projects/dto/project-response.dto';

export interface ProductRequestUpdatedEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface ProductRequestChangeSummary {
  changeType: string;
  description: string;
  details: string[];
  changeReason?: string | null;
  changedBy: string;
  changedAt: string;
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findSyllabusLink(project: ProjectDetailDto): { title: string; url: string } | null {
  const syllabus = project.links?.find((l) => l.type === 'SYLLABUS' || l.title?.toLowerCase() === 'syllabus');
  return syllabus ? { title: syllabus.title, url: syllabus.url } : null;
}

export function buildProductRequestUpdatedEmail(
  project: ProjectDetailDto,
  changeSummary: ProductRequestChangeSummary,
): ProductRequestUpdatedEmailContent {
  const syllabus = findSyllabusLink(project);
  const subject = `Solicitud modificada: ${project.program}`;

  const rows: Array<[string, string]> = [
    ['Proyecto', project.program],
    ['Escuela', project.school],
    ['Programa', project.program],
    ['Cambio realizado', changeSummary.description],
    ['Usuario que hizo el cambio', changeSummary.changedBy],
    ['Fecha/hora', formatDate(changeSummary.changedAt)],
    ['Estado actual del proyecto', project.status],
    ['Link syllabus', syllabus ? syllabus.url : '—'],
    ['Motivo', changeSummary.changeReason?.trim() || '—'],
  ];

  const detailsText = changeSummary.details.length ? changeSummary.details.map((item) => `- ${item}`).join('\n') : '—';
  const rowsText = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const detailsHtml = changeSummary.details.length
    ? `<ul>${changeSummary.details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>—</p>';

  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:6px 12px 6px 0;vertical-align:top;color:#475569;">${escapeHtml(k)}</th><td style="padding:6px 0;">${escapeHtml(v)}</td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;color:#ea580c;">Solicitud modificada</h1>
  <p style="margin:0 0 20px;">Se registró una modificación estructural en la solicitud existente.</p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">${htmlRows}</table>
  <h2 style="font-size:16px;margin:24px 0 8px;">Detalle del cambio</h2>
  ${detailsHtml}
  <p style="margin-top:32px;font-size:12px;color:#64748b;">Correo automático — Producto CUN. No responder a este mensaje.</p>
</body>
</html>`;

  const text = [
    'Solicitud modificada',
    '',
    rowsText,
    '',
    'Detalle del cambio:',
    detailsText,
    '',
    'Correo automático — Producto CUN',
  ].join('\n');

  return { subject, html, text };
}
