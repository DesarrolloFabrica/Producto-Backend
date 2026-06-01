import { ProjectDetailDto } from '../../projects/dto/project-response.dto';
import {
  buildFrontendUrl,
  buildInstitutionalEmailLayout,
  buildInstitutionalSubject,
  buildSemesterStructure,
  formatDateShort,
  formatModality,
} from '../../email/templates/institutional-email-layout';

export interface ProductRequestCreatedEmailContent {
  subject: string;
  html: string;
  text: string;
}

function countCurriculum(project: ProjectDetailDto): {
  semesters: number;
  subjects: number;
} {
  const semesters = project.semesters.length;
  const subjects = project.semesters.reduce((n, s) => n + s.subjects.length, 0);
  return { semesters, subjects };
}

function formatCreatedBy(project: ProjectDetailDto): string {
  const owner = project.productOwner;
  if (!owner?.email?.trim()) return '—';
  const name = owner.name?.trim();
  if (name) return `${name} (${owner.email.trim()})`;
  return owner.email.trim();
}

export function buildProductRequestCreatedEmail(
  project: ProjectDetailDto,
): ProductRequestCreatedEmailContent {
  const counts = countCurriculum(project);
  const structure = buildSemesterStructure(project.semesters);
  const title = 'Nueva solicitud registrada';

  const { html, text } = buildInstitutionalEmailLayout({
    title,
    eventLabel: 'Nueva solicitud',
    intro:
      'Se ha creado una nueva solicitud académica y está disponible para gestión en la plataforma.',
    highlights: [
      { label: 'Escuela', value: project.school },
      { label: 'Programa', value: project.program },
      { label: 'Modalidad', value: formatModality(project.modality) },
      { label: 'Entrega esperada', value: formatDateShort(project.expectedDeliveryDate) },
      { label: 'Creado por', value: formatCreatedBy(project) },
    ],
    summaryLines: [
      `Semestres: ${counts.semesters}`,
      `Asignaturas: ${counts.subjects}`,
    ],
    sections: [{ title: 'Estructura académica', html: structure.html, text: structure.text }],
    cta: {
      label: 'Ver solicitud en plataforma',
      url: buildFrontendUrl(`/projects/${project.id}`),
    },
  });

  return {
    subject: buildInstitutionalSubject(title, project.program),
    html,
    text,
  };
}
