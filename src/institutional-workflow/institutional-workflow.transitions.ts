import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { UserRole } from '../common/enums/user-role.enum';

const RETURN_ACTIONS = new Set<InstitutionalOperationalAction>([
  InstitutionalOperationalAction.PLANNING_RETURN_INITIAL,
  InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION,
  InstitutionalOperationalAction.PLANNING_RETURN_LMS,
]);

export function isReturnAction(action: InstitutionalOperationalAction): boolean {
  return RETURN_ACTIONS.has(action);
}

export function resolveNextInstitutionalState(params: {
  current: InstitutionalOperationalState;
  action: InstitutionalOperationalAction;
}): InstitutionalOperationalState | null {
  const { current, action } = params;
  switch (action) {
    case InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL:
      if (
        current === InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION ||
        current === InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING
      ) {
        return InstitutionalOperationalState.PENDING_FACTORY;
      }
      return null;
    case InstitutionalOperationalAction.PLANNING_RETURN_INITIAL:
      if (current === InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION) {
        return InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING;
      }
      return null;
    case InstitutionalOperationalAction.PRODUCT_RESUBMIT_REQUEST:
      if (current === InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING) {
        return InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION;
      }
      return null;
    case InstitutionalOperationalAction.FACTORY_START_PRODUCTION:
      if (
        current === InstitutionalOperationalState.PENDING_FACTORY ||
        current === InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING ||
        current === InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT
      ) {
        return InstitutionalOperationalState.IN_FACTORY_PRODUCTION;
      }
      return null;
    case InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT:
      if (current === InstitutionalOperationalState.IN_FACTORY_PRODUCTION) {
        return InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION;
      }
      return null;
    case InstitutionalOperationalAction.PLANNING_VALIDATE_PRODUCTION:
      if (
        current === InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION ||
        current === InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING
      ) {
        return InstitutionalOperationalState.PENDING_LMS_UPLOAD;
      }
      return null;
    case InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION:
      if (current === InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION) {
        return InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING;
      }
      return null;
    case InstitutionalOperationalAction.LMS_START_UPLOAD:
      if (
        current === InstitutionalOperationalState.PENDING_LMS_UPLOAD ||
        current === InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING
      ) {
        return InstitutionalOperationalState.IN_LMS_UPLOAD;
      }
      return null;
    case InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD:
      if (current === InstitutionalOperationalState.IN_LMS_UPLOAD) {
        return InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION;
      }
      return null;
    case InstitutionalOperationalAction.PLANNING_VALIDATE_LMS:
      if (
        current === InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION ||
        current === InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING
      ) {
        return InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW;
      }
      return null;
    case InstitutionalOperationalAction.PLANNING_RETURN_LMS:
      if (current === InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION) {
        return InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING;
      }
      return null;
    case InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW:
      if (current === InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW) {
        return InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW;
      }
      return null;
    case InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES:
      if (current === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW) {
        return InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT;
      }
      return null;
    case InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC:
      if (current === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW) {
        return InstitutionalOperationalState.PENDING_PROJECT_RADICATION;
      }
      return null;
    default:
      return null;
  }
}

export function responsibleRoleForState(
  state: InstitutionalOperationalState,
): UserRole {
  switch (state) {
    case InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION:
    case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION:
    case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION:
    case InstitutionalOperationalState.PENDING_PROJECT_RADICATION:
      return UserRole.PLANEACION;
    case InstitutionalOperationalState.FINALIZED:
      return UserRole.PLANEACION;
    case InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING:
    case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
    case InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW:
      return UserRole.PRODUCT;
    case InstitutionalOperationalState.PENDING_FACTORY:
    case InstitutionalOperationalState.IN_FACTORY_PRODUCTION:
    case InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING:
    case InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT:
      return UserRole.FABRICA;
    case InstitutionalOperationalState.PENDING_LMS_UPLOAD:
    case InstitutionalOperationalState.IN_LMS_UPLOAD:
    case InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING:
      return UserRole.LMS;
    default:
      return UserRole.PLANEACION;
  }
}

/** @deprecated Use isAcademicChecklistEditable or isAcademicReviewReady */
export function isAcademicReviewPhase(state: InstitutionalOperationalState): boolean {
  return isAcademicChecklistEditable(state) || isAcademicReviewReady(state);
}

export function isAcademicChecklistEditable(state: InstitutionalOperationalState): boolean {
  return state === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW;
}

export function isAcademicReviewReady(state: InstitutionalOperationalState): boolean {
  return state === InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW;
}

export function isCorrectionInFactory(state: InstitutionalOperationalState): boolean {
  return state === InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT;
}

/** Fase 7 del pipeline: revisión académica Product (temas, checklist, granularidad). */
export function isSemesterProductAcademicReviewPhase(
  state: InstitutionalOperationalState,
): boolean {
  return (
    state === InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW ||
    state === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW ||
    state === InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT
  );
}

export function statesPendingForRole(role: UserRole): InstitutionalOperationalState[] {
  switch (role) {
    case UserRole.PLANEACION:
      return [
        InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
        InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION,
        InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
      ];
    case UserRole.FABRICA:
      return [
        InstitutionalOperationalState.PENDING_FACTORY,
        InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
        InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING,
        InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
      ];
    case UserRole.LMS:
      return [
        InstitutionalOperationalState.PENDING_LMS_UPLOAD,
        InstitutionalOperationalState.IN_LMS_UPLOAD,
        InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
      ];
    case UserRole.PRODUCT:
      return [
        InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
        InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
        InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
        InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
      ];
    case UserRole.ADMIN:
      return Object.values(InstitutionalOperationalState).filter(
        (s) => s !== InstitutionalOperationalState.FINALIZED,
      );
    default:
      return [];
  }
}

export function allowedActionsForRole(
  role: UserRole,
  state: InstitutionalOperationalState,
): InstitutionalOperationalAction[] {
  if (role === UserRole.ADMIN) {
    return allActionsForState(state);
  }
  const actions: InstitutionalOperationalAction[] = [];
  if (role === UserRole.PLANEACION) {
    if (state === InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION) {
      actions.push(
        InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL,
        InstitutionalOperationalAction.PLANNING_RETURN_INITIAL,
      );
    }
    if (state === InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION) {
      actions.push(
        InstitutionalOperationalAction.PLANNING_VALIDATE_PRODUCTION,
        InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION,
      );
    }
    if (state === InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION) {
      actions.push(
        InstitutionalOperationalAction.PLANNING_VALIDATE_LMS,
        InstitutionalOperationalAction.PLANNING_RETURN_LMS,
      );
    }
  }
  if (role === UserRole.FABRICA) {
    if (
      state === InstitutionalOperationalState.PENDING_FACTORY ||
      state === InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING ||
      state === InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT
    ) {
      actions.push(InstitutionalOperationalAction.FACTORY_START_PRODUCTION);
    }
    if (state === InstitutionalOperationalState.IN_FACTORY_PRODUCTION) {
      actions.push(InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT);
    }
  }
  if (role === UserRole.LMS) {
    if (
      state === InstitutionalOperationalState.PENDING_LMS_UPLOAD ||
      state === InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING
    ) {
      actions.push(InstitutionalOperationalAction.LMS_START_UPLOAD);
    }
    if (state === InstitutionalOperationalState.IN_LMS_UPLOAD) {
      actions.push(InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD);
    }
  }
  if (role === UserRole.PRODUCT) {
    if (state === InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING) {
      actions.push(InstitutionalOperationalAction.PRODUCT_RESUBMIT_REQUEST);
    }
    if (state === InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW) {
      actions.push(InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW);
    }
    if (state === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW) {
      actions.push(
        InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES,
        InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC,
      );
    }
  }
  return actions;
}

function allActionsForState(state: InstitutionalOperationalState): InstitutionalOperationalAction[] {
  const roles = [
    UserRole.PLANEACION,
    UserRole.FABRICA,
    UserRole.LMS,
    UserRole.PRODUCT,
  ] as const;
  const set = new Set<InstitutionalOperationalAction>();
  for (const r of roles) {
    for (const a of allowedActionsForRole(r, state)) {
      set.add(a);
    }
  }
  return [...set];
}

/** Acciones permitidas en el centro operacional de asignatura (fase 7 Product). */
export const SUBJECT_LEVEL_OPERATIONAL_ACTIONS = new Set<InstitutionalOperationalAction>([
  InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES,
  InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC,
]);

export function isSemesterScopedOperationalAction(action: InstitutionalOperationalAction): boolean {
  if (action === InstitutionalOperationalAction.INSTITUTIONAL_SUBJECT_CREATED) {
    return false;
  }
  return !SUBJECT_LEVEL_OPERATIONAL_ACTIONS.has(action);
}

export function filterSubjectAvailableActions(
  actions: InstitutionalOperationalAction[],
  institutionalFlow: boolean,
): InstitutionalOperationalAction[] {
  if (!institutionalFlow) return actions;
  return actions.filter((action) => SUBJECT_LEVEL_OPERATIONAL_ACTIONS.has(action));
}
