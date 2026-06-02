import { SubjectOperationalState } from '../common/enums/subject-operational-state.enum';
import { FactoryProgramWorkItemDto } from './dto/factory-program-work-item.dto';
import { FactorySubjectWorkItemDto } from './dto/factory-subject-work-item.dto';

const FACTORY_STAGE_LABELS: Record<SubjectOperationalState, string> = {
  [SubjectOperationalState.NOT_STARTED]: 'Listas para producir',
  [SubjectOperationalState.IN_PRODUCTION]: 'En producción',
  [SubjectOperationalState.IN_REVIEW]: 'En seguimiento',
  [SubjectOperationalState.CHANGES_REQUESTED]: 'Correcciones',
  [SubjectOperationalState.CORRECTION_SENT]: 'Corrección enviada',
  [SubjectOperationalState.APPROVED]: 'Completadas',
};

function isSemesterProductionComplete(item: FactorySubjectWorkItemDto): boolean {
  const total = item.subjectsTotal ?? 0;
  const ready = item.subjectsReady ?? 0;
  return total > 0 && ready >= total;
}

export function aggregateFactoryItemsToPrograms(
  items: FactorySubjectWorkItemDto[],
): FactoryProgramWorkItemDto[] {
  const byProject = new Map<string, FactorySubjectWorkItemDto[]>();
  for (const item of items) {
    const list = byProject.get(item.projectId) ?? [];
    list.push(item);
    byProject.set(item.projectId, list);
  }

  const programs: FactoryProgramWorkItemDto[] = [];

  for (const [projectId, semesters] of byProject) {
    const sorted = [...semesters].sort((a, b) => a.semesterNumber - b.semesterNumber);
    const first = sorted[0]!;
    const totalSubjects = sorted.reduce((sum, s) => sum + (s.subjectsTotal ?? 0), 0);
    const completedSubjects = sorted.reduce((sum, s) => sum + (s.subjectsReady ?? 0), 0);
    const completedSemesters = sorted.filter(isSemesterProductionComplete).length;

    const approvedCount = sorted.filter(
      (s) => s.operationalState === SubjectOperationalState.APPROVED,
    ).length;

    const stageCounts = new Map<string, number>();
    for (const sem of sorted) {
      if (sem.operationalState === SubjectOperationalState.APPROVED) continue;
      const label = FACTORY_STAGE_LABELS[sem.operationalState] ?? sem.operationalState;
      stageCounts.set(label, (stageCounts.get(label) ?? 0) + 1);
    }
    const activeStageSummary = [...stageCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    if (approvedCount > 0) {
      activeStageSummary.push({ label: 'Completadas', count: approvedCount });
      activeStageSummary.sort((a, b) => b.count - a.count);
    }

    const dueDates = sorted
      .map((s) => s.expectedDeliveryDate)
      .filter((d): d is Date => d != null);
    const nearestDueDate =
      dueDates.length > 0 ? dueDates.reduce((min, d) => (d < min ? d : min)) : null;

    programs.push({
      kind: 'program',
      projectId,
      program: first.program,
      school: first.school,
      totalSemesters: sorted.length,
      completedSemesters,
      totalSubjects,
      completedSubjects,
      pendingSubjects: Math.max(0, totalSubjects - completedSubjects),
      activeStageSummary,
      nearestDueDate,
      openObservations: sorted.reduce((sum, s) => sum + s.openObservationsCount, 0),
      actionUrl: `/projects/${projectId}/operations`,
      semesters: sorted,
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
