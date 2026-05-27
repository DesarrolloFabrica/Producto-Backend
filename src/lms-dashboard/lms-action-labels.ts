import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';

const LMS_ACTION_LABELS: Partial<Record<InstitutionalOperationalAction, string>> = {
  [InstitutionalOperationalAction.LMS_START_UPLOAD]: 'Carga LMS iniciada',
  [InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD]: 'Carga/publicación confirmada',
  [InstitutionalOperationalAction.PLANNING_RETURN_LMS]: 'Devuelta por Planeación',
  [InstitutionalOperationalAction.PLANNING_VALIDATE_LMS]: 'Carga validada por Planeación',
};

export function labelLmsActivityAction(action: InstitutionalOperationalAction): string {
  return LMS_ACTION_LABELS[action] ?? 'Actividad en flujo LMS';
}
