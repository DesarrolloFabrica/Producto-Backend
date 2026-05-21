import { ProjectDetailDto } from '../../projects/dto/project-response.dto';

export interface ProductRequestCreatedEmailContent {
  subject: string;
  html: string;
  text: string;
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatOwner(owner: { name: string; email: string } | null | undefined): string {
  if (!owner) return '—';
  return `${owner.name} <${owner.email}>`;
}

function buildCurriculumText(project: ProjectDetailDto): { html: string; text: string } {
  const semesterLines: string[] = [];
  const semesterHtml: string[] = [];

  for (const semester of project.semesters) {
    const subjectNames = semester.subjects.map((s) => s.name);
    const topicLines = semester.subjects.flatMap((s) =>
      s.topics.map((t) => `      · ${s.name} → ${t.name}`),
    );

    semesterLines.push(
      `  Semestre ${semester.semesterNumber} (entrega fábrica: ${formatDate(semester.factoryExpectedDate)})`,
      `    Asignaturas: ${subjectNames.join(', ') || '—'}`,
      ...(topicLines.length ? ['    Temas:', ...topicLines] : ['    Temas: —']),
    );

    const topicsHtml = semester.subjects
      .flatMap((s) =>
        s.topics.map(
          (t) =>
            `<li><strong>${escapeHtml(s.name)}</strong> → ${escapeHtml(t.name)}</li>`,
        ),
      )
      .join('');

    semesterHtml.push(`
      <li>
        <strong>Semestre ${semester.semesterNumber}</strong>
        (entrega fábrica: ${escapeHtml(formatDate(semester.factoryExpectedDate))})<br/>
        <em>Asignaturas:</em> ${escapeHtml(subjectNames.join(', ') || '—')}
        ${topicsHtml ? `<ul>${topicsHtml}</ul>` : '<br/><em>Temas:</em> —'}
      </li>`);
  }

  return {
    text: semesterLines.join('\n'),
    html: semesterHtml.length
      ? `<ul>${semesterHtml.join('')}</ul>`
      : '<p>—</p>',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findSyllabusLink(project: ProjectDetailDto): { title: string; url: string } | null {
  const syllabus = project.links?.find(
    (l) => l.type === 'SYLLABUS' || l.title?.toLowerCase() === 'syllabus',
  );
  return syllabus ? { title: syllabus.title, url: syllabus.url } : null;
}

export function buildProductRequestCreatedEmail(
  project: ProjectDetailDto,
): ProductRequestCreatedEmailContent {
  const syllabus = findSyllabusLink(project);
  const curriculum = buildCurriculumText(project);
  const observations = project.observations?.trim() || '—';

  const subject = `Nueva solicitud de producto creada: ${project.program}`;

  const rows: Array<[string, string]> = [
    ['Escuela', project.school],
    ['Programa', project.program],
    ['Modalidad', project.modality],
    ['Tipo de solicitud', project.requestType],
    ['Prioridad', project.priority],
    ['Fecha esperada de entrega', formatDate(project.expectedDeliveryDate)],
    ['Product owner', formatOwner(project.productOwner)],
    ['Factory owner', formatOwner(project.factoryOwner)],
    ['Observaciones', observations],
    ['Link syllabus', syllabus ? syllabus.url : '—'],
    ['Fecha de creación', formatDate(project.createdAt)],
  ];

  const textRows = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

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
  <h1 style="font-size:20px;margin:0 0 16px;color:#ea580c;">Nueva solicitud de producto</h1>
  <p style="margin:0 0 20px;">Se registró una nueva solicitud en la plataforma Producto.</p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">${htmlRows}</table>
  <h2 style="font-size:16px;margin:24px 0 8px;">Semestres, asignaturas y temas</h2>
  ${curriculum.html}
  <p style="margin-top:32px;font-size:12px;color:#64748b;">Correo automático — Producto CUN. No responder a este mensaje.</p>
</body>
</html>`;

  const text = [
    'Nueva solicitud de producto',
    '',
    textRows,
    '',
    'Semestres, asignaturas y temas:',
    curriculum.text,
    '',
    '—',
    'Correo automático — Producto CUN',
  ].join('\n');

  return { subject, html, text };
}
