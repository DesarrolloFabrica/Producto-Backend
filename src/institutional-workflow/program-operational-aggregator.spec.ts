import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { aggregateSemestersToPrograms } from './program-operational-aggregator';
import type { SemesterOperationalWorkItemDto } from './semester-operational-workflow.service';

function semester(partial: Partial<SemesterOperationalWorkItemDto> & Pick<SemesterOperationalWorkItemDto, 'projectId' | 'semesterNumber'>): SemesterOperationalWorkItemDto {
  return {
    kind: 'semester',
    semesterId: `sem-${partial.semesterNumber}`,
    semesterNumber: partial.semesterNumber,
    subjectId: 'sub-1',
    subjectName: `Semestre ${partial.semesterNumber}`,
    projectId: partial.projectId,
    program: partial.program ?? 'PROGRAMA INGENIERIA',
    school: partial.school ?? 'ESCUELA',
    operationalState:
      partial.operationalState ?? InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
    currentResponsibleRole: partial.currentResponsibleRole ?? UserRole.FABRICA,
    stageDueAt: partial.stageDueAt ?? new Date('2026-06-03'),
    slaStatus: partial.slaStatus ?? SlaStatus.ON_TIME,
    availableActions: [],
    lastReturnReason: null,
    actionUrl: `/projects/${partial.projectId}/semesters/sem-${partial.semesterNumber}/operations`,
    subjectsTotal: partial.subjectsTotal ?? 2,
    subjectsReady: partial.subjectsReady ?? 0,
    openObservations: partial.openObservations ?? 0,
  };
}

describe('aggregateSemestersToPrograms', () => {
  it('agrupa dos semestres del mismo proyecto en una fila', () => {
    const result = aggregateSemestersToPrograms([
      semester({
        projectId: 'proj-1',
        semesterNumber: 2,
        operationalState: InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
        subjectsReady: 2,
        currentResponsibleRole: UserRole.PRODUCT,
      }),
      semester({
        projectId: 'proj-1',
        semesterNumber: 8,
        operationalState: InstitutionalOperationalState.PENDING_FACTORY,
        subjectsReady: 0,
        stageDueAt: new Date('2026-06-26'),
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.totalSemesters).toBe(2);
    expect(result[0]!.completedSemesters).toBe(1);
    expect(result[0]!.totalSubjects).toBe(4);
    expect(result[0]!.completedSubjects).toBe(2);
    expect(result[0]!.academicReviewPendingCount).toBe(1);
    expect(result[0]!.semesters).toHaveLength(2);
    expect(result[0]!.actionUrl).toBe('/projects/proj-1/operations');
  });

  it('usa el peor SLA entre semestres', () => {
    const result = aggregateSemestersToPrograms([
      semester({
        projectId: 'proj-1',
        semesterNumber: 1,
        slaStatus: SlaStatus.ON_TIME,
      }),
      semester({
        projectId: 'proj-1',
        semesterNumber: 2,
        slaStatus: SlaStatus.OVERDUE,
      }),
    ]);

    expect(result[0]!.slaStatus).toBe(SlaStatus.OVERDUE);
  });

  it('genera resumen de etapas activas compuesto', () => {
    const result = aggregateSemestersToPrograms([
      semester({
        projectId: 'proj-1',
        semesterNumber: 2,
        operationalState: InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
      }),
      semester({
        projectId: 'proj-1',
        semesterNumber: 8,
        operationalState: InstitutionalOperationalState.PENDING_FACTORY,
      }),
    ]);

    const labels = result[0]!.activeStageSummary.map((s) => s.label);
    expect(labels).toContain('Revisión académica');
    expect(labels).toContain('Fábrica');
    expect(result[0]!.activeStageSummary.reduce((n, s) => n + s.count, 0)).toBe(2);
  });
});
