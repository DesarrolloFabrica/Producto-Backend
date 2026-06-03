import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { statesPendingForRole } from '../institutional-workflow/institutional-workflow.transitions';

/** Semestres visibles en reportes Fábrica (alineado con factory-dashboard). */
export const FACTORY_VISIBLE_SEMESTER_STATES: InstitutionalOperationalState[] = [
  ...new Set([
    ...statesPendingForRole(UserRole.FABRICA),
    InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
    InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION,
    InstitutionalOperationalState.PENDING_LMS_UPLOAD,
    InstitutionalOperationalState.IN_LMS_UPLOAD,
    InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
    InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
    InstitutionalOperationalState.FINALIZED,
  ]),
];
