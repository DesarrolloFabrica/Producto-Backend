import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import {
  ProgramActiveStageSummaryDto,
  ProgramOperationalWorkItemDto,
} from './dto/program-operational-work-item.dto';
import type { SemesterOperationalWorkItemDto } from './semester-operational-workflow.service';

const ACADEMIC_REVIEW_STATES = new Set<InstitutionalOperationalState>([
  InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
]);

const STAGE_BUCKET_LABELS: Record<string, string> = {
  academic_review: 'Revisión académica',
  factory: 'Fábrica',
  lms: 'LMS',
  planning: 'Planeación',
  radication: 'Radicación',
  finalized: 'Finalizado',
  other: 'Otro',
};

const SLA_SEVERITY: Record<SlaStatus, number> = {
  [SlaStatus.OVERDUE]: 5,
  [SlaStatus.AT_RISK]: 4,
  [SlaStatus.ON_TIME]: 3,
  [SlaStatus.FINALIZED_OVERDUE]: 2,
  [SlaStatus.FINALIZED_ON_TIME]: 1,
};

export function operationalStateStageBucket(state: InstitutionalOperationalState): string {
  switch (state) {
    case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
    case InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW:
    case InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT:
    case InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING:
      return 'academic_review';
    case InstitutionalOperationalState.PENDING_FACTORY:
    case InstitutionalOperationalState.IN_FACTORY_PRODUCTION:
    case InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING:
    case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION:
      return 'factory';
    case InstitutionalOperationalState.PENDING_LMS_UPLOAD:
    case InstitutionalOperationalState.IN_LMS_UPLOAD:
    case InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING:
    case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION:
      return 'lms';
    case InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION:
      return 'planning';
    case InstitutionalOperationalState.PENDING_PROJECT_RADICATION:
      return 'radication';
    case InstitutionalOperationalState.FINALIZED:
      return 'finalized';
    default:
      return 'other';
  }
}

function isSemesterProductionComplete(item: SemesterOperationalWorkItemDto): boolean {
  return item.subjectsTotal > 0 && item.subjectsReady >= item.subjectsTotal;
}

function worstSlaStatus(statuses: SlaStatus[]): SlaStatus {
  if (!statuses.length) return SlaStatus.ON_TIME;
  return statuses.reduce((worst, current) =>
    (SLA_SEVERITY[current] ?? 0) > (SLA_SEVERITY[worst] ?? 0) ? current : worst,
  );
}

function buildActiveStageSummary(
  semesters: SemesterOperationalWorkItemDto[],
): ProgramActiveStageSummaryDto[] {
  const counts = new Map<string, number>();
  for (const sem of semesters) {
    const bucket = operationalStateStageBucket(sem.operationalState);
    if (bucket === 'finalized') continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({
      label: STAGE_BUCKET_LABELS[bucket] ?? bucket,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function resolveDominantResponsible(semesters: SemesterOperationalWorkItemDto[]): UserRole {
  const roles = semesters.map((s) => s.currentResponsibleRole);
  const unique = new Set(roles);
  if (unique.size === 1) return roles[0]!;
  return roles[0]!;
}

export function aggregateSemestersToPrograms(
  items: SemesterOperationalWorkItemDto[],
): ProgramOperationalWorkItemDto[] {
  const byProject = new Map<string, SemesterOperationalWorkItemDto[]>();
  for (const item of items) {
    const list = byProject.get(item.projectId) ?? [];
    list.push(item);
    byProject.set(item.projectId, list);
  }

  const programs: ProgramOperationalWorkItemDto[] = [];

  for (const [projectId, semesters] of byProject) {
    const sortedSemesters = [...semesters].sort(
      (a, b) => a.semesterNumber - b.semesterNumber,
    );
    const first = sortedSemesters[0]!;
    const totalSubjects = sortedSemesters.reduce((sum, s) => sum + s.subjectsTotal, 0);
    const completedSubjects = sortedSemesters.reduce((sum, s) => sum + s.subjectsReady, 0);
    const completedSemesters = sortedSemesters.filter(isSemesterProductionComplete).length;
    const academicReviewPendingCount = sortedSemesters.filter((s) =>
      ACADEMIC_REVIEW_STATES.has(s.operationalState),
    ).length;

    const dueDates = sortedSemesters
      .map((s) => s.stageDueAt)
      .filter((d): d is Date => d != null);
    const nearestDueDate =
      dueDates.length > 0
        ? dueDates.reduce((min, d) => (d < min ? d : min))
        : null;

    programs.push({
      kind: 'program',
      projectId,
      program: first.program,
      school: first.school,
      totalSemesters: sortedSemesters.length,
      completedSemesters,
      totalSubjects,
      completedSubjects,
      pendingSubjects: Math.max(0, totalSubjects - completedSubjects),
      academicReviewPendingCount,
      activeStageSummary: buildActiveStageSummary(sortedSemesters),
      nearestDueDate,
      slaStatus: worstSlaStatus(sortedSemesters.map((s) => s.slaStatus as SlaStatus)),
      currentResponsibleRole: resolveDominantResponsible(sortedSemesters),
      openObservations: sortedSemesters.reduce((sum, s) => sum + s.openObservations, 0),
      actionUrl: `/projects/${projectId}/operations`,
      semesters: sortedSemesters,
    });
  }

  programs.sort((a, b) => {
    const aDue = a.nearestDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.nearestDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return a.program.localeCompare(b.program, 'es');
  });

  return programs;
}
