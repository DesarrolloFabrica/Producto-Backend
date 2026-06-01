import { ProjectDetailDto } from '../../projects/dto/project-response.dto';
import {
  buildBulletList,
  buildFrontendUrl,
  buildInstitutionalEmailLayout,
  buildInstitutionalSubject,
  escapeHtml,
  formatDateTime,
} from '../../email/templates/institutional-email-layout';

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

export function buildProductRequestUpdatedEmail(
  project: ProjectDetailDto,
  changeSummary: ProductRequestChangeSummary,
): ProductRequestUpdatedEmailContent {
  const title = 'Solicitud modificada';
  const details = buildBulletList(changeSummary.details);
  const motivo = changeSummary.changeReason?.trim();

  const { html, text } = buildInstitutionalEmailLayout({
    title,
    eventLabel: 'Modificación',
    intro: changeSummary.description,
    highlights: [
      { label: 'Programa', value: project.program },
      { label: 'Cambio', value: changeSummary.changeType },
      { label: 'Realizado por', value: changeSummary.changedBy },
    ],
    summaryLines: [`Fecha: ${formatDateTime(changeSummary.changedAt)}`],
    sections: [
      ...(motivo
        ? [
            {
              title: 'Motivo',
              html: `<p style="margin:0;font-size:14px;color:#1F2937;line-height:1.6;">${escapeHtml(motivo)}</p>`,
              text: motivo,
            },
          ]
        : []),
      { title: 'Detalle del cambio', html: details.html, text: details.text },
    ],
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
