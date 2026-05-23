import { ProjectStatus } from '../../common/enums/project-status.enum';
import { SubjectOperationalState } from '../../common/enums/subject-operational-state.enum';
import { SubjectStatus } from '../../common/enums/subject-status.enum';

export interface OperationalStateInput {
  subjectStatus: SubjectStatus;
  projectStatus?: ProjectStatus;
  openObservationsCount: number;
  correctionSentCount: number;
}

export function deriveSubjectOperationalState(
  input: OperationalStateInput,
): SubjectOperationalState {
  const { subjectStatus, projectStatus, openObservationsCount, correctionSentCount } =
    input;

  if (subjectStatus === SubjectStatus.APPROVED) {
    return SubjectOperationalState.APPROVED;
  }
  if (openObservationsCount > 0) {
    return SubjectOperationalState.CHANGES_REQUESTED;
  }
  if (correctionSentCount > 0) {
    return SubjectOperationalState.CORRECTION_SENT;
  }
  if (subjectStatus === SubjectStatus.CHANGES_REQUESTED) {
    return SubjectOperationalState.CHANGES_REQUESTED;
  }
  if (
    subjectStatus === SubjectStatus.IN_REVIEW ||
    subjectStatus === SubjectStatus.SUBMITTED
  ) {
    return SubjectOperationalState.IN_REVIEW;
  }
  if (subjectStatus === SubjectStatus.IN_PRODUCTION) {
    return SubjectOperationalState.IN_PRODUCTION;
  }
  return SubjectOperationalState.NOT_STARTED;
}

export function buildSubjectActionUrl(
  subjectId: string,
  state: SubjectOperationalState,
  openObservationsCount: number,
): string {
  const focusCorrection =
    state === SubjectOperationalState.CHANGES_REQUESTED || openObservationsCount > 0
      ? '?focus=correction'
      : '';
  return `/subjects/${subjectId}${focusCorrection}`;
}

export function getOperationalCtaLabel(state: SubjectOperationalState): string {
  switch (state) {
    case SubjectOperationalState.NOT_STARTED:
      return 'Iniciar producción';
    case SubjectOperationalState.IN_PRODUCTION:
      return 'Continuar producción';
    case SubjectOperationalState.IN_REVIEW:
      return 'Esperando Product';
    case SubjectOperationalState.CHANGES_REQUESTED:
      return 'Ver correcciones';
    case SubjectOperationalState.CORRECTION_SENT:
      return 'Esperando validación';
    case SubjectOperationalState.APPROVED:
      return 'Ver aprobado';
    default:
      return 'Ver asignatura';
  }
}
