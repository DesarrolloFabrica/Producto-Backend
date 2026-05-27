import type { ObservationEntity } from '../../observations/observation.entity';
import type { SubjectEntity } from '../../subjects/subject.entity';

function buildAppUrl(path: string): string {
  const base = (process.env.FRONTEND_APP_URL ?? process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function resolveDeliverableLabel(observation: ObservationEntity): string {
  if (observation.checklistItem?.label) return observation.checklistItem.label;
  if (observation.topic?.name) return `Tema: ${observation.topic.name}`;
  return 'Asignatura';
}

export function buildProductObservationsBatchEmail(params: {
  subject: SubjectEntity;
  observations: ObservationEntity[];
  batchId: string;
}) {
  const { subject, observations, batchId } = params;
  const project = subject.project;
  const subjectUrl = buildAppUrl(`/subjects/${subject.id}?focus=correction`);
  const rows = observations
    .map(
      (obs) =>
        `<li><strong>${resolveDeliverableLabel(obs)}</strong>: ${obs.text}<br/><a href="${subjectUrl}">Ver asignatura</a></li>`,
    )
    .join('');

  const subjectLine = `[Producto] Observaciones de Product — ${subject.name}`;
  const html = `
    <html><body style="font-family:Arial,sans-serif;color:#1e293b">
      <h2>Observaciones de Product para Fábrica</h2>
      <p><strong>Programa:</strong> ${project?.program ?? '—'}</p>
      <p><strong>Asignatura:</strong> ${subject.name}</p>
      <p><strong>Total:</strong> ${observations.length} observación(es)</p>
      <ul>${rows}</ul>
      <p><a href="${subjectUrl}">Abrir asignatura</a></p>
      <p style="color:#64748b;font-size:12px">Lote ${batchId}</p>
    </body></html>`;
  const text = `Observaciones Product → Fábrica\n${subject.name}\n${observations.length} observaciones\n${subjectUrl}`;

  return { subject: subjectLine, html, text };
}

export function buildFactoryCorrectionsBatchEmail(params: {
  subject: SubjectEntity;
  observations: ObservationEntity[];
  batchId: string;
}) {
  const { subject, observations, batchId } = params;
  const project = subject.project;
  const subjectUrl = buildAppUrl(`/subjects/${subject.id}`);
  const rows = observations
    .map(
      (obs) =>
        `<li><strong>${resolveDeliverableLabel(obs)}</strong>: corrección aplicada — ${obs.text}</li>`,
    )
    .join('');

  const subjectLine = `[Producto] Correcciones de Fábrica — ${subject.name}`;
  const html = `
    <html><body style="font-family:Arial,sans-serif;color:#1e293b">
      <h2>Correcciones notificadas por Fábrica</h2>
      <p><strong>Programa:</strong> ${project?.program ?? '—'}</p>
      <p><strong>Asignatura:</strong> ${subject.name}</p>
      <p><strong>Total:</strong> ${observations.length} corrección(es)</p>
      <ul>${rows}</ul>
      <p><a href="${subjectUrl}">Revisar en Product</a></p>
      <p style="color:#64748b;font-size:12px">Lote ${batchId}</p>
    </body></html>`;
  const text = `Correcciones Fábrica → Product\n${subject.name}\n${observations.length} correcciones\n${subjectUrl}`;

  return { subject: subjectLine, html, text };
}
