import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { ProjectInstitutionalAction } from '../common/enums/project-institutional-action.enum';

const INSTITUTIONAL_ACTION_LABELS: Partial<Record<InstitutionalOperationalAction, string>> = {
  [InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL]: 'Validación inicial aprobada',
  [InstitutionalOperationalAction.PLANNING_RETURN_INITIAL]: 'Devolución inicial a Product',
  [InstitutionalOperationalAction.PLANNING_VALIDATE_PRODUCTION]: 'Producción validada',
  [InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION]: 'Producción devuelta a Fábrica',
  [InstitutionalOperationalAction.PLANNING_VALIDATE_LMS]: 'Carga LMS validada',
  [InstitutionalOperationalAction.PLANNING_RETURN_LMS]: 'Carga LMS devuelta',
  [InstitutionalOperationalAction.PLANNING_FINALIZE]: 'Asignatura finalizada',
};

const PROJECT_ACTION_LABELS: Partial<Record<ProjectInstitutionalAction, string>> = {
  [ProjectInstitutionalAction.PLANNING_VALIDATE_RADICATION]: 'Radicado validado y solicitud cerrada',
  [ProjectInstitutionalAction.PLANNING_RETURN_RADICATION]: 'Radicado devuelto a Product',
};

export function labelInstitutionalAction(action: InstitutionalOperationalAction): string {
  return INSTITUTIONAL_ACTION_LABELS[action] ?? 'Actividad operacional';
}

export function labelProjectInstitutionalAction(action: ProjectInstitutionalAction): string {
  return PROJECT_ACTION_LABELS[action] ?? 'Actividad de radicación';
}
