import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import {
  allowedActionsForRole,
  responsibleRoleForState,
} from '../institutional-workflow/institutional-workflow.transitions';
import { InstitutionalWorkflowSlaService } from '../institutional-workflow/institutional-workflow-sla.service';
import { OperationalTransitionEntity } from '../institutional-workflow/operational-transition.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import {
  LmsActivityItemDto,
  LmsDashboardKpisDto,
  LmsDashboardSummaryDto,
  LmsSubjectPreviewDto,
} from './dto/lms-dashboard-summary.dto';
import { labelLmsActivityAction } from './lms-action-labels';

const LMS_QUEUE_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.PENDING_LMS_UPLOAD,
  InstitutionalOperationalState.IN_LMS_UPLOAD,
  InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
];

const COMPLETED_UPLOAD_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
  InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
  InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
  InstitutionalOperationalState.FINALIZED,
];

@Injectable()
export class LmsDashboardService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(OperationalTransitionEntity)
    private readonly transitionRepo: Repository<OperationalTransitionEntity>,
    private readonly slaService: InstitutionalWorkflowSlaService,
  ) {}

  private assertLmsAccess(user: UserEntity): void {
    if (user.role !== UserRole.LMS && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only LMS or ADMIN can access LMS dashboard');
    }
  }

  async getSummary(user: UserEntity): Promise<LmsDashboardSummaryDto> {
    this.assertLmsAccess(user);

    const [kpis, recentActivity, returnedPreview, completedPreview] = await Promise.all([
      this.loadKpis(),
      this.loadRecentActivity(),
      this.loadReturnedPreview(),
      this.loadCompletedPreview(),
    ]);

    return { kpis, recentActivity, returnedPreview, completedPreview };
  }

  private async loadKpis(): Promise<LmsDashboardKpisDto> {
    const subjectCounts = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoin('subject.project', 'project')
      .select('subject.operational_state', 'state')
      .addSelect('COUNT(*)::int', 'count')
      .where('subject.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .groupBy('subject.operational_state')
      .getRawMany<{ state: InstitutionalOperationalState; count: number }>();

    const countByState = new Map(subjectCounts.map((r) => [r.state, Number(r.count)]));

    const completedUpload = COMPLETED_UPLOAD_STATES.reduce(
      (sum, state) => sum + (countByState.get(state) ?? 0),
      0,
    );

    const [inProgressProjects, finalizedProjects] = await Promise.all([
      this.projectRepo
        .createQueryBuilder('project')
        .innerJoin('project.subjects', 'subject', 'subject.deletedAt IS NULL')
        .where('project.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('project.institutional_state IS NOT NULL')
        .andWhere('project.institutional_state != :finalized', {
          finalized: ProjectInstitutionalState.FINALIZED,
        })
        .andWhere('subject.operational_state IN (:...lmsRelated)', {
          lmsRelated: [...LMS_QUEUE_STATES, ...COMPLETED_UPLOAD_STATES],
        })
        .distinct(true)
        .getCount(),
      this.projectRepo
        .createQueryBuilder('project')
        .innerJoin('project.subjects', 'subject', 'subject.deletedAt IS NULL')
        .innerJoin(
          'operational_transitions',
          't',
          't.subjectId = subject.id AND t.action IN (:...lmsActions)',
          {
            lmsActions: [
              InstitutionalOperationalAction.LMS_START_UPLOAD,
              InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD,
            ],
          },
        )
        .where('project.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('project.institutional_state = :finalized', {
          finalized: ProjectInstitutionalState.FINALIZED,
        })
        .distinct(true)
        .getCount(),
    ]);

    return {
      pendingUpload: countByState.get(InstitutionalOperationalState.PENDING_LMS_UPLOAD) ?? 0,
      inUpload: countByState.get(InstitutionalOperationalState.IN_LMS_UPLOAD) ?? 0,
      completedUpload,
      returnedByPlanning:
        countByState.get(InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING) ?? 0,
      inProgressProjects,
      finalizedProjects,
    };
  }

  private async loadRecentActivity(): Promise<LmsActivityItemDto[]> {
    const lmsActorRows = await this.transitionRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.subject', 'subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('t.actor', 'actor')
      .where('t.actorRole = :lmsRole', { lmsRole: UserRole.LMS })
      .orderBy('t.createdAt', 'DESC')
      .take(15)
      .getMany();

    const planningReturnRows = await this.transitionRepo
      .createQueryBuilder('t')
      .innerJoinAndSelect('t.subject', 'subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('t.actor', 'actor')
      .where('t.action = :returnLms', {
        returnLms: InstitutionalOperationalAction.PLANNING_RETURN_LMS,
      })
      .orderBy('t.createdAt', 'DESC')
      .take(10)
      .getMany();

    const merged = [...lmsActorRows, ...planningReturnRows]
      .map((t) => ({
        id: t.id,
        kind: 'subject' as const,
        projectId: t.subject.project.id,
        subjectId: t.subject.id,
        subjectName: t.subject.name,
        program: t.subject.project.program,
        school: t.subject.project.school,
        actionLabel: labelLmsActivityAction(t.action),
        comment: t.comment,
        returnReason: t.returnReason,
        actorName: t.actor.name,
        createdAt: t.createdAt,
        deepLink: `/subjects/${t.subject.id}/operations`,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const seen = new Set<string>();
    const unique: LmsActivityItemDto[] = [];
    for (const row of merged) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      unique.push(row);
      if (unique.length >= 20) break;
    }
    return unique;
  }

  private mapSubjectPreview(subject: SubjectEntity, semesterNumber: number): LmsSubjectPreviewDto {
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      projectId: subject.project.id,
      program: subject.project.program,
      school: subject.project.school,
      semesterNumber,
      operationalState: subject.operationalState,
      stageDueAt: subject.operationalStageDueAt,
      slaStatus: this.slaService.computeSlaStatus({
        state: subject.operationalState,
        stageEnteredAt: subject.operationalStageEnteredAt,
        stageDueAt: subject.operationalStageDueAt,
        finalizedAt: subject.operationalFinalizedAt,
      }),
      lastReturnReason: subject.lastReturnReason,
      currentResponsibleRole: responsibleRoleForState(subject.operationalState),
      availableActions: allowedActionsForRole(UserRole.LMS, subject.operationalState),
    };
  }

  private async loadReturnedPreview(): Promise<LmsSubjectPreviewDto[]> {
    const subjects = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('subject.semester', 'semester')
      .where('subject.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('subject.operational_state = :returned', {
        returned: InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
      })
      .orderBy('subject.last_return_at', 'DESC', 'NULLS LAST')
      .take(10)
      .getMany();

    return subjects.map((s) => this.mapSubjectPreview(s, s.semester.semesterNumber));
  }

  private async loadCompletedPreview(): Promise<LmsSubjectPreviewDto[]> {
    const subjects = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoinAndSelect('subject.project', 'project')
      .innerJoinAndSelect('subject.semester', 'semester')
      .where('subject.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('subject.operational_state IN (:...states)', { states: COMPLETED_UPLOAD_STATES })
      .orderBy('subject.updatedAt', 'DESC')
      .take(10)
      .getMany();

    return subjects.map((s) => this.mapSubjectPreview(s, s.semester.semesterNumber));
  }
}
