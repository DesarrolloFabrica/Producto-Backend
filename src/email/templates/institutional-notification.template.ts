import { NotificationEventType } from '../../common/enums/notification-event-type.enum';
import {
  buildFrontendUrl,
  buildInstitutionalEmailLayout,
  buildInstitutionalSubject,
} from './institutional-email-layout';

export interface InstitutionalEmailContext {
  program?: string | null;
  semester?: string | null;
  responsible?: string | null;
  status?: string | null;
  deadline?: string | null;
}

export interface InstitutionalNotificationTemplateInput {
  title: string;
  message: string;
  eventLabel: string;
  context: InstitutionalEmailContext;
  actionUrl?: string | null;
  frontendBaseUrl?: string | null;
}

export function getInstitutionalEventLabel(eventType: NotificationEventType | string | null | undefined): string {
  switch (eventType) {
    case NotificationEventType.INSTITUTIONAL_REQUEST_CREATED:
      return 'Nueva solicitud';
    case NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_INITIAL:
      return 'Planeación';
    case NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED:
      return 'Fábrica';
    case NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION:
      return 'Planeación';
    case NotificationEventType.INSTITUTIONAL_LMS_UPLOAD_COMPLETED:
      return 'LMS';
    case NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_LMS:
      return 'Planeación';
    case NotificationEventType.INSTITUTIONAL_PRODUCT_APPROVED_ACADEMIC:
      return 'Product';
    case NotificationEventType.INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES:
      return 'Product';
    case NotificationEventType.INSTITUTIONAL_RETURNED_TO_PRODUCT:
      return 'Product';
    case NotificationEventType.INSTITUTIONAL_RETURNED_TO_FACTORY:
      return 'Fábrica';
    case NotificationEventType.INSTITUTIONAL_RETURNED_TO_LMS:
      return 'LMS';
    case NotificationEventType.PROJECT_READY_FOR_RADICATION:
      return 'Planeación';
    case NotificationEventType.PLANNING_RADICATION_VALIDATED:
      return 'Planeación';
    case NotificationEventType.PLANNING_RADICATION_RETURNED:
      return 'Planeación';
    case NotificationEventType.PROJECT_FINALIZED:
    case NotificationEventType.INSTITUTIONAL_FINALIZED:
      return 'Finalizado';
    default:
      return 'Notificación';
  }
}

function resolveActionUrl(actionUrl: string | null | undefined, frontendBaseUrl?: string | null): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('http')) return actionUrl;

  const base = (
    frontendBaseUrl ??
    process.env.APP_PUBLIC_URL ??
    process.env.FRONTEND_APP_URL ??
    process.env.CORS_ORIGIN?.split(',')[0] ??
    ''
  )
    .trim()
    .replace(/\/$/, '');

  if (!base) return buildFrontendUrl(actionUrl);
  return `${base}${actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`}`;
}

function buildContextHighlights(context: InstitutionalEmailContext) {
  const highlights: Array<{ label: string; value: string }> = [];
  if (context.program) highlights.push({ label: 'Programa', value: context.program });
  if (context.semester) highlights.push({ label: 'Semestre', value: context.semester });
  if (context.responsible) highlights.push({ label: 'Responsable', value: context.responsible });
  if (context.status) highlights.push({ label: 'Estado', value: context.status });
  if (context.deadline) highlights.push({ label: 'Fecha límite', value: context.deadline });
  return highlights.slice(0, 3);
}

export function buildInstitutionalNotificationEmail(
  input: InstitutionalNotificationTemplateInput,
): { subject: string; html: string; text: string } {
  const { title, message, eventLabel, context, actionUrl, frontendBaseUrl } = input;
  const highlights = buildContextHighlights(context);
  const fullActionUrl = resolveActionUrl(actionUrl, frontendBaseUrl);

  const { html, text } = buildInstitutionalEmailLayout({
    title,
    eventLabel,
    intro: message,
    highlights: highlights.length ? highlights : undefined,
    cta: fullActionUrl
      ? { label: 'Ver en plataforma', url: fullActionUrl }
      : undefined,
  });

  return {
    subject: buildInstitutionalSubject(title),
    html,
    text,
  };
}

export function buildSimpleTestEmail(message: string): { html: string; text: string } {
  const { html, text } = buildInstitutionalEmailLayout({
    title: 'Correo de prueba',
    eventLabel: 'Sistema',
    intro: message,
  });
  return { html, text };
}
