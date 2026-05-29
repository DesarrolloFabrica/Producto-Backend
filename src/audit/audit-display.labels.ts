import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

export const INSTITUTIONAL_STATE_LABELS: Record<string, string> = {
  [InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION]: 'Pendiente validación inicial',
  [InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING]: 'Devuelto a Product',
  [InstitutionalOperationalState.PENDING_FACTORY]: 'Pendiente Fábrica',
  [InstitutionalOperationalState.IN_FACTORY_PRODUCTION]: 'En producción — Fábrica',
  [InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION]: 'Pendiente validación de producción',
  [InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING]: 'Devuelto a Fábrica',
  [InstitutionalOperationalState.PENDING_LMS_UPLOAD]: 'Pendiente carga LMS',
  [InstitutionalOperationalState.IN_LMS_UPLOAD]: 'En carga LMS',
  [InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION]: 'Pendiente validación LMS',
  [InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING]: 'Devuelto a LMS',
  [InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW]: 'Pendiente revisión académica',
  [InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW]: 'En revisión académica',
  [InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT]: 'Correcciones solicitadas',
  [InstitutionalOperationalState.PENDING_PROJECT_RADICATION]: 'Pendiente radicación',
  [InstitutionalOperationalState.FINALIZED]: 'Finalizado',
};

export const SUBJECT_STATUS_LABELS: Record<string, string> = {
  [SubjectStatus.PENDING]: 'Pendiente',
  [SubjectStatus.IN_PRODUCTION]: 'En producción',
  [SubjectStatus.SUBMITTED]: 'Enviado',
  [SubjectStatus.IN_REVIEW]: 'En revisión',
  [SubjectStatus.CHANGES_REQUESTED]: 'Correcciones solicitadas',
  [SubjectStatus.APPROVED]: 'Aprobado',
  [SubjectStatus.DELIVERED]: 'Entregado',
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  PROJECT: 'Proyecto',
  SUBJECT: 'Materia',
  SEMESTER: 'Semestre',
  OBSERVATION: 'Observación',
  OBSERVATION_BATCH: 'Lote de observaciones',
  CHECKLIST_ITEM: 'Checklist',
  TOPIC: 'Tema académico',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.PRODUCT]: 'Producto',
  [UserRole.FABRICA]: 'Fábrica',
  [UserRole.PLANEACION]: 'Planeación',
  [UserRole.LMS]: 'LMS',
  [UserRole.ADMIN]: 'Administración',
};

export function institutionalStateLabel(state: unknown): string {
  if (typeof state !== 'string' || !state.trim()) return '—';
  return INSTITUTIONAL_STATE_LABELS[state] ?? state.replaceAll('_', ' ').toLowerCase();
}

export function subjectStatusLabel(status: unknown): string {
  if (typeof status !== 'string' || !status.trim()) return '—';
  return SUBJECT_STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  NO_EXISTE: 'No existe',
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  ENTREGADO: 'Entregado',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

export const BULK_APPROVE_SCOPE_LABELS: Record<string, string> = {
  SUBJECT: 'Toda la materia',
  CATEGORY: 'Por categoría',
  TOPIC: 'Por tema',
};

export const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  informacion_base: 'Información base',
  evaluacion_competencias: 'Evaluación por competencias',
  actividades_recursos: 'Actividades y recursos',
};

export function checklistStatusLabel(status: unknown): string {
  if (typeof status !== 'string' || !status.trim()) return '—';
  return CHECKLIST_STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function bulkApproveScopeLabel(scope: unknown): string {
  if (typeof scope !== 'string' || !scope.trim()) return 'Checklist académico';
  return BULK_APPROVE_SCOPE_LABELS[scope] ?? scope;
}

export function checklistCategoryLabel(category: unknown): string {
  if (typeof category !== 'string' || !category.trim()) return '—';
  return CHECKLIST_CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
}
