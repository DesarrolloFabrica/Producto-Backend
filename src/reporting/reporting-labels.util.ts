import { Modality } from '../common/enums/modality.enum';
import { Priority } from '../common/enums/priority.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { institutionalStateLabel, roleLabel } from '../audit/audit-display.labels';
import { operationalStateStageBucket } from '../institutional-workflow/program-operational-aggregator';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  [SlaStatus.ON_TIME]: 'En tiempo',
  [SlaStatus.AT_RISK]: 'En riesgo',
  [SlaStatus.OVERDUE]: 'Vencido',
  [SlaStatus.FINALIZED_ON_TIME]: 'Finalizado a tiempo',
  [SlaStatus.FINALIZED_OVERDUE]: 'Finalizado vencido',
};

export function slaStatusLabel(status: SlaStatus | string): string {
  return SLA_STATUS_LABELS[status as SlaStatus] ?? String(status);
}

export function modalityLabel(modality: Modality | string): string {
  const map: Record<string, string> = {
    VIRTUAL: 'Virtual',
    PRESENCIAL: 'Presencial',
    HIBRIDA: 'Híbrida',
  };
  return map[String(modality)] ?? String(modality).replace(/_/g, ' ');
}

export function priorityLabel(priority: Priority | string): string {
  const map: Record<string, string> = {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
    URGENT: 'Urgente',
  };
  return map[String(priority)] ?? String(priority);
}

export const PROJECT_INSTITUTIONAL_STATE_LABELS: Record<string, string> = {
  [ProjectInstitutionalState.INSTITUTIONAL_IN_PROGRESS]: 'En progreso institucional',
  [ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION]: 'Listo para radicación Product',
  [ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK]: 'Pendiente revisión Planeación',
  [ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT]: 'Radicación devuelta a Product',
  [ProjectInstitutionalState.FINALIZED]: 'Finalizado',
};

export function projectInstitutionalStateLabel(
  state: ProjectInstitutionalState | string | null | undefined,
): string {
  if (state === null || state === undefined || state === '') return '—';
  return PROJECT_INSTITUTIONAL_STATE_LABELS[String(state)] ?? String(state).replaceAll('_', ' ').toLowerCase();
}

export function radicationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Activa',
    RETURNED: 'Devuelta',
    VALIDATED: 'Validada',
    SUPERSEDED: 'Reemplazada',
  };
  return map[String(status).toUpperCase()] ?? String(status);
}

export function projectStatusLabel(status: ProjectStatus | string): string {
  const map: Record<string, string> = {
    PENDING_SYLLABUS: 'Pendiente diseño curricular',
    PENDING_SUBJECT_MATTER_EXPERT: 'Pendiente SME',
    DRAFT: 'Borrador',
    READY_FOR_PRODUCTION: 'Listo para producción',
    IN_PRODUCTION: 'En producción',
    FEEDBACK_PENDING: 'Feedback pendiente',
    IN_REVIEW: 'En revisión',
    DELIVERED_TO_LMS: 'Entregado a LMS',
    COMPLETED: 'Completado',
    CLOSED: 'Cerrado',
    CANCELLED: 'Cancelado',
  };
  return map[String(status)] ?? String(status);
}

export function observationStatusLabel(status: ObservationStatus | string): string {
  const map: Record<string, string> = {
    ABIERTA: 'Abierta',
    EN_CORRECCION: 'En corrección',
    RESUELTA: 'Resuelta',
  };
  return map[String(status)] ?? String(status);
}

export function factoryProductionStatusLabel(status: FactoryProductionStatus | string): string {
  const map: Record<string, string> = {
    NOT_STARTED: 'No iniciado',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completado',
  };
  return map[String(status)] ?? String(status);
}

export function stageBucketLabel(state: InstitutionalOperationalState): string {
  const bucket = operationalStateStageBucket(state);
  const labels: Record<string, string> = {
    academic_review: 'Revisión académica',
    factory: 'Fábrica',
    lms: 'LMS',
    planning: 'Planeación',
    radication: 'Radicación',
    finalized: 'Finalizado',
    other: 'Otro',
  };
  return labels[bucket] ?? bucket;
}

export function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

export function formatReportDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatReportDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${formatReportDate(d)} ${hours}:${minutes}`;
}

export { institutionalStateLabel, roleLabel };
