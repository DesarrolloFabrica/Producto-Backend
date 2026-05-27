import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { InstitutionalWorkflowSlaService } from '../institutional-workflow/institutional-workflow-sla.service';
import { responsibleRoleForState } from '../institutional-workflow/institutional-workflow.transitions';
import { OperationalTransitionEntity } from '../institutional-workflow/operational-transition.entity';
import { ProjectOperationalTransitionEntity } from '../project-radication/project-operational-transition.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { UserEntity } from '../users/user.entity';
import {
  PlanningActivityItemDto,
  PlanningDashboardKpisDto,
  PlanningDashboardSummaryDto,
  PlanningFinalizedProjectDto,
  PlanningSubjectPreviewDto,
} from './dto/planning-dashboard-summary.dto';
import {
  labelInstitutionalAction,
  labelProjectInstitutionalAction,
} from './planning-action-labels';

const RETURNED_BY_PLANNING_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
  InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING,
  InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
];

const PLANNING_PENDING_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
  InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION,
  InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
];

interface ActivityRow {
  id: string;
  kind: 'subject' | 'project';
  projectId: string;
  subjectId: string | null;
  subjectName: string | null;
  program: string;
  school: string;
  actionLabel: string;
  comment: string | null;
  returnReason: string | null;
  actorName: string;
  createdAt: Date;
  deepLink: string;
}

@Injectable()
export class PlanningDashboardService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(OperationalTransitionEntity)
    private readonly subjectTransitionRepo: Repository<OperationalTransitionEntity>,
    @InjectRepository(ProjectOperationalTransitionEntity)
    private readonly projectTransitionRepo: Repository<ProjectOperationalTransitionEntity>,
    private readonly slaService: InstitutionalWorkflowSlaService,
  ) {}

  private assertPlanningAccess(user: UserEntity): void {
    if (user.role !== UserRole.PLANEACION && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PLANEACION or ADMIN can access planning dashboard');
    }
  }

  async getSummary(user: UserEntity): Promise<PlanningDashboardSummaryDto> {
    this.assertPlanningAccess(user);

    const [kpis, recentActivity, returnedPreview, finalizedProjects] = await Promise.all([
      this.loadKpis(),
      this.loadRecentActivity(),
      this.loadReturnedPreview(),
      this.loadFinalizedProjects(),
    ]);

    return { kpis, recentActivity, returnedPreview, finalizedProjects };
  }

  private async loadKpis(): Promise<PlanningDashboardKpisDto> {
    const programCounts = await this.semesterRepo
      .createQueryBuilder('sem')
      .innerJoin('sem.project', 'project')
      .select('sem.operational_state', 'state')
      .addSelect('COUNT(DISTINCT project.id)::int', 'count')
      .where('sem.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('sem.operational_state IN (:...states)', { states: PLANNING_PENDING_STATES })
      .groupBy('sem.operational_state')
      .getRawMany<{ state: InstitutionalOperationalState; count: number }>();

    const countByState = new Map(programCounts.map((r) => [r.state, Number(r.count)]));

    const [radicationsPending, inProgress, finalized] = await Promise.all([
      this.projectRepo
        .createQueryBuilder('project')
        .where('project.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('project.institutional_state = :radCheck', {
          radCheck: ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK,
        })
        .getCount(),
      this.projectRepo
        .createQueryBuilder('project')
        .where('project.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('project.institutional_state IS NOT NULL')
        .andWhere('project.institutional_state != :finalized', {
          finalized: ProjectInstitutionalState.FINALIZED,
        })
        .getCount(),
      this.projectRepo
        .createQueryBuilder('project')
        .where('project.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('project.institutional_state = :finalized', {
          finalized: ProjectInstitutionalState.FINALIZED,
        })
        .getCount(),
    ]);

    return {
      initialValidations:
        countByState.get(InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION) ?? 0,
      productionValidations:
        countByState.get(InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION) ?? 0,
      lmsValidations:
        countByState.get(InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION) ?? 0,
      radicationsPending,
      inProgress,
      finalized,
    };
  }

  private async loadRecentActivity(): Promise<PlanningActivityItemDto[]> {
    const subjectRows = await this.subjectTransitionRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.subject', 'subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('t.actor', 'actor')
      .where('t.actorRole = :role', { role: UserRole.PLANEACION })
      .orderBy('t.createdAt', 'DESC')
      .take(8)
      .getMany();

    const projectRows = await this.projectTransitionRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.project', 'project')
      .innerJoinAndSelect('t.actor', 'actor')
      .where('t.actorRole = :role', { role: UserRole.PLANEACION })
      .orderBy('t.createdAt', 'DESC')
      .take(8)
      .getMany();

    const merged: ActivityRow[] = [
      ...subjectRows.map((t) => ({
        id: t.id,
        kind: 'subject' as const,
        projectId: t.subject.project.id,
        subjectId: t.subject.id,
        subjectName: t.subject.name,
        program: t.subject.project.program,
        school: t.subject.project.school,
        actionLabel: labelInstitutionalAction(t.action),
        comment: t.comment,
        returnReason: t.returnReason,
        actorName: t.actor.name,
        createdAt: t.createdAt,
        deepLink: `/subjects/${t.subject.id}/operations`,
      })),
      ...projectRows.map((t) => ({
        id: t.id,
        kind: 'project' as const,
        projectId: t.project.id,
        subjectId: null,
        subjectName: null,
        program: t.project.program,
        school: t.project.school,
        actionLabel: labelProjectInstitutionalAction(t.action),
        comment: t.comment,
        returnReason: t.returnReason,
        actorName: t.actor.name,
        createdAt: t.createdAt,
        deepLink: `/projects/${t.project.id}`,
      })),
    ];

    merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return merged.slice(0, 8);
  }

  private async loadReturnedPreview(): Promise<PlanningSubjectPreviewDto[]> {
    const subjects = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('subject.semester', 'semester')
      .where('subject.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('subject.operational_state IN (:...states)', { states: RETURNED_BY_PLANNING_STATES })
      .orderBy('subject.last_return_at', 'DESC', 'NULLS LAST')
      .addOrderBy('subject.updatedAt', 'DESC')
      .take(10)
      .getMany();

    return subjects.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      projectId: s.project.id,
      program: s.project.program,
      school: s.project.school,
      operationalState: s.operationalState,
      stageDueAt: s.operationalStageDueAt,
      slaStatus: this.slaService.computeSlaStatus({
        state: s.operationalState,
        stageEnteredAt: s.operationalStageEnteredAt,
        stageDueAt: s.operationalStageDueAt,
        finalizedAt: s.operationalFinalizedAt,
      }),
      lastReturnReason: s.lastReturnReason,
      currentResponsibleRole: responsibleRoleForState(s.operationalState),
    }));
  }

  private async loadFinalizedProjects(): Promise<PlanningFinalizedProjectDto[]> {
    const projects = await this.projectRepo
      .createQueryBuilder('project')
      .innerJoinAndSelect('project.productOwner', 'productOwner')
      .where('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('project.institutional_state = :finalized', {
        finalized: ProjectInstitutionalState.FINALIZED,
      })
      .orderBy('project.radicated_at', 'DESC', 'NULLS LAST')
      .addOrderBy('project.updatedAt', 'DESC')
      .take(10)
      .getMany();

    if (!projects.length) return [];

    const projectIds = projects.map((p) => p.id);
    const scopeRows = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoin('subject.semester', 'semester')
      .select('subject.projectId', 'projectId')
      .addSelect('COUNT(DISTINCT subject.id)::int', 'subjectsCount')
      .addSelect('COUNT(DISTINCT semester.id)::int', 'semestersCount')
      .where('subject.projectId IN (:...projectIds)', { projectIds })
      .andWhere('subject.deletedAt IS NULL')
      .groupBy('subject.projectId')
      .getRawMany<{ projectId: string; subjectsCount: number; semestersCount: number }>();

    const scopeByProject = new Map(
      scopeRows.map((r) => [
        r.projectId,
        { subjectsCount: Number(r.subjectsCount), semestersCount: Number(r.semestersCount) },
      ]),
    );

    return projects.map((p) => {
      const scope = scopeByProject.get(p.id);
      return {
        projectId: p.id,
        program: p.program,
        school: p.school,
        radicationNumber: p.radicationNumber,
        radicatedAt: p.radicatedAt,
        finalizedAt: p.radicatedAt,
        productOwnerName: p.productOwner.name,
        subjectsCount: scope?.subjectsCount ?? 0,
        semestersCount: scope?.semestersCount ?? 0,
      };
    });
  }
}
