import type { ObservationEntity } from '../../observations/observation.entity';
import type { SubjectEntity } from '../../subjects/subject.entity';
import {
  buildBulletList,
  buildFrontendUrl,
  buildInstitutionalEmailLayout,
  buildInstitutionalSubject,
} from '../../email/templates/institutional-email-layout';

function resolveDeliverableLabel(observation: ObservationEntity): string {
  if (observation.checklistItem?.label) return observation.checklistItem.label;
  if (observation.topic?.name) return observation.topic.name;
  return 'General';
}

function buildObservationItems(observations: ObservationEntity[]): { html: string; text: string } {
  const items = observations.map((obs) => {
    const label = resolveDeliverableLabel(obs);
    return `${label}: ${obs.text}`;
  });
  return buildBulletList(items);
}

export function buildProductObservationsBatchEmail(params: {
  subject: SubjectEntity;
  observations: ObservationEntity[];
  batchId: string;
}) {
  const { subject, observations } = params;
  const project = subject.project;
  const subjectUrl = buildFrontendUrl(`/subjects/${subject.id}?focus=correction`);
  const title = 'Observaciones de Product';
  const items = buildObservationItems(observations);

  const { html, text } = buildInstitutionalEmailLayout({
    title,
    eventLabel: 'Fábrica',
    intro:
      'Product ha registrado observaciones que requieren revisión y corrección en Fábrica.',
    highlights: [
      { label: 'Programa', value: project?.program ?? '—' },
      { label: 'Asignatura', value: subject.name },
      { label: 'Observaciones', value: String(observations.length) },
    ],
    sections: [{ title: 'Detalle', html: items.html, text: items.text }],
    cta: { label: 'Ver asignatura en plataforma', url: subjectUrl },
  });

  return {
    subject: buildInstitutionalSubject(title, subject.name),
    html,
    text,
  };
}

export function buildFactoryCorrectionsBatchEmail(params: {
  subject: SubjectEntity;
  observations: ObservationEntity[];
  batchId: string;
}) {
  const { subject, observations } = params;
  const project = subject.project;
  const subjectUrl = buildFrontendUrl(`/subjects/${subject.id}`);
  const title = 'Correcciones de Fábrica';
  const items = buildBulletList(
    observations.map((obs) => {
      const label = resolveDeliverableLabel(obs);
      return `${label}: Corrección aplicada — ${obs.text}`;
    }),
  );

  const { html, text } = buildInstitutionalEmailLayout({
    title,
    eventLabel: 'Product',
    intro:
      'Fábrica ha notificado correcciones aplicadas que requieren validación en Product.',
    highlights: [
      { label: 'Programa', value: project?.program ?? '—' },
      { label: 'Asignatura', value: subject.name },
      { label: 'Correcciones', value: String(observations.length) },
    ],
    sections: [{ title: 'Detalle', html: items.html, text: items.text }],
    cta: { label: 'Revisar en plataforma', url: subjectUrl },
  });

  return {
    subject: buildInstitutionalSubject(title, subject.name),
    html,
    text,
  };
}
