import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { SemesterStatus } from '../common/enums/semester-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { ProjectsService } from '../projects/projects.service';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { SemesterWorkflowService } from '../workflow/semester-workflow.service';
import { SubjectWorkflowService } from '../workflow/subject-workflow.service';
import { CHECKLIST_CATEGORY_LABELS } from './checklist.constants';
import { ProjectEntity } from '../projects/project.entity';
import {
  assertChecklistStatusTransition,
  isEligibleForProductBulkApprove,
} from './checklist-transitions';
import { ChecklistItemEntity } from './checklist-item.entity';
import {
  BulkApproveSectionDto,
  BulkApproveSectionScope,
} from './dto/bulk-approve-section.dto';
import { BulkApproveSectionResponseDto } from './dto/bulk-approve-section-response.dto';
import { ChecklistStatusUpdateResponseDto } from './dto/checklist-status-update-response.dto';
import { UpdateChecklistStatusDto } from './dto/update-checklist-status.dto';
import { InstitutionalWorkflowService } from '../institutional-workflow/institutional-workflow.service';
import { ACADEMIC_REVIEW_BLOCKED_MESSAGE } from '../institutional-workflow/institutional-workflow.constants';
import { isInstitutionalWorkflowEnabled } from '../institutional-workflow/institutional-workflow.config';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { isAcademicChecklistEditable } from '../institutional-workflow/institutional-workflow.transitions';

const SUBJECT_REVIEWABLE_STATUSES = new Set<SubjectStatus>([
  SubjectStatus.IN_REVIEW,
  SubjectStatus.CHANGES_REQUESTED,
  SubjectStatus.SUBMITTED,
]);

interface BulkApproveContextRow {
  subjectId: string;
  subjectStatus: SubjectStatus;
  subjectProgress: number;
  subjectOperationalState: InstitutionalOperationalState;
  semesterId: string;
  semesterStatus: SemesterStatus;
  projectId: string;
  projectStatus: ProjectStatus;
  projectProgress: number;
  projectLegacyWorkflow: boolean;
  productOwnerId: string | null;
  factoryOwnerId: string | null;
}

interface ChecklistStatusContextRow {
  itemId: string;
  checklistStatus: ChecklistStatus;
  ownerRole: UserRole;
  subjectId: string;
  subjectStatus: SubjectStatus;
  subjectProgress: number;
  subjectOperationalState: InstitutionalOperationalState | null;
  semesterId: string;
  semesterStatus: SemesterStatus;
  projectId: string;
  projectStatus: ProjectStatus;
  projectProgress: number;
  projectLegacyWorkflow: boolean;
  productOwnerId: string | null;
  factoryOwnerId: string | null;
}

@Injectable()
export class ChecklistService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
    private readonly progressService: ProgressService,
    private readonly subjectWorkflowService: SubjectWorkflowService,
    private readonly semesterWorkflowService: SemesterWorkflowService,
    private readonly projectWorkflowService: ProjectWorkflowService,
    private readonly institutionalWorkflowService: InstitutionalWorkflowService,
  ) {}

  async updateStatus(
    checklistItemId: string,
    dto: UpdateChecklistStatusDto,
    user: UserEntity,
  ): Promise<ChecklistStatusUpdateResponseDto> {
    if (
      user.role !== UserRole.FABRICA &&
      user.role !== UserRole.PRODUCT &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const row = await this.loadChecklistStatusContext(checklistItemId, manager);

      if (!row) {
        throw new NotFoundException('Checklist item not found');
      }

      this.assertCanModifyProjectContext(row, user);
      if (user.role === UserRole.PRODUCT || user.role === UserRole.ADMIN) {
        await this.assertProductAcademicChecklistAllowed(row.subjectId, manager);
      }

      const previousStatus = row.checklistStatus;
      if (previousStatus !== dto.status) {
        assertChecklistStatusTransition(user.role, previousStatus, dto.status, row.ownerRole);
      }

      if (previousStatus === dto.status) {
        return this.buildChecklistStatusResponse(row, previousStatus);
      }

      await manager
        .createQueryBuilder()
        .update(ChecklistItemEntity)
        .set({
          status: dto.status,
          updatedBy: { id: user.id } as any,
        })
        .where('id = :id', { id: checklistItemId })
        .andWhere('status != :status', { status: dto.status })
        .execute();

      await this.auditService.createLog(
        {
          entityType: RelatedEntityType.CHECKLIST_ITEM,
          entityId: row.itemId,
          action: AuditAction.CHECKLIST_UPDATE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: dto.status },
        },
        manager,
      );

      let subjectStatus = row.subjectStatus;
      let semesterStatus = row.semesterStatus;
      let projectStatus = row.projectStatus;
      let subjectProgress = Number(row.subjectProgress);
      let projectProgress = Number(row.projectProgress);

      if (
        this.isInstitutionalAcademicChecklist({
          operationalState: row.subjectOperationalState,
          projectLegacyWorkflow: row.projectLegacyWorkflow,
        })
      ) {
        const progress = await this.progressService.recalculateTreeFromSubject(
          row.subjectId,
          manager,
        );
        subjectProgress = progress.subjectProgress;
        projectProgress = progress.projectProgress;
      } else {
        subjectProgress = await this.progressService.calculateSubjectProgress(
          row.subjectId,
          manager,
        );
        subjectStatus = await this.subjectWorkflowService.updateSubjectStatus(
          row.subjectId,
          user.id,
          manager,
          row.subjectStatus,
        );
        semesterStatus = await this.semesterWorkflowService.updateSemesterStatus(
          row.semesterId,
          user.id,
          manager,
          row.semesterStatus,
        );
        projectStatus = await this.projectWorkflowService.updateProjectStatus(
          row.projectId,
          user.id,
          manager,
          row.projectStatus,
        );
        projectProgress = await this.progressService.calculateProjectProgress(
          row.projectId,
          manager,
        );
      }

      return {
        checklistItemId: row.itemId,
        checklistStatus: dto.status,
        subjectId: row.subjectId,
        subjectStatus,
        subjectProgress,
        semesterId: row.semesterId,
        semesterStatus,
        projectId: row.projectId,
        projectStatus,
        projectProgress,
      };
    });
  }

  async bulkApproveSection(
    dto: BulkApproveSectionDto,
    user: UserEntity,
  ): Promise<BulkApproveSectionResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can bulk-approve checklist sections');
    }

    return await this.dataSource.transaction(async (manager) => {
      const checklistRepo = manager.getRepository(ChecklistItemEntity);

      const ctx = await this.loadBulkApproveContext(dto.subjectId, manager);

      if (!ctx) {
        throw new NotFoundException('Subject not found');
      }

      const project = this.projectFromBulkApproveContext(ctx);
      this.projectsService.assertCanModifyProject(project, user);
      if (user.role === UserRole.PRODUCT) {
        this.projectsService.assertCanManageAsProductOwner(project, user);
      }

      if (
        isInstitutionalWorkflowEnabled() &&
        !ctx.projectLegacyWorkflow &&
        !isAcademicChecklistEditable(ctx.subjectOperationalState)
      ) {
        throw new ForbiddenException(ACADEMIC_REVIEW_BLOCKED_MESSAGE);
      }
      if (!SUBJECT_REVIEWABLE_STATUSES.has(ctx.subjectStatus)) {
        throw new BadRequestException(
          'Subject must be IN_REVIEW, CHANGES_REQUESTED or SUBMITTED for bulk approval',
        );
      }

      const scopedItems = await this.loadScopedChecklistItemsForBulk(dto, manager);
      const toUpdate = scopedItems.filter(isEligibleForProductBulkApprove);
      const updatedItemIds = toUpdate.map((item) => item.id);

      if (updatedItemIds.length > 0) {
        await checklistRepo
          .createQueryBuilder()
          .update(ChecklistItemEntity)
          .set({
            status: ChecklistStatus.APROBADO,
            updatedBy: { id: user.id } as any,
          })
          .where('id IN (:...ids)', { ids: updatedItemIds })
          .execute();
      }

      let subjectProgress = ctx.subjectProgress;
      let projectProgress = ctx.projectProgress;

      if (updatedItemIds.length > 0) {
        await this.auditService.createLog(
          {
            entityType: RelatedEntityType.SUBJECT,
            entityId: ctx.subjectId,
            action: AuditAction.CHECKLIST_SECTION_BULK_APPROVED,
            userId: user.id,
            beforeJson: {
              scope: dto.scope,
              topicId: dto.topicId ?? null,
              category: dto.category ?? null,
            },
            afterJson: {
              countUpdated: updatedItemIds.length,
              itemIds: updatedItemIds,
            },
          },
          manager,
        );

        const progress = this.isInstitutionalAcademicChecklist({
          operationalState: ctx.subjectOperationalState,
          projectLegacyWorkflow: ctx.projectLegacyWorkflow,
        })
          ? await this.progressService.recalculateTreeFromSubject(ctx.subjectId, manager)
          : await this.recalculateWorkflowAfterChecklistChange(
              ctx.subjectId,
              ctx.semesterId,
              ctx.projectId,
              user.id,
              manager,
              {
                subjectStatus: ctx.subjectStatus,
                semesterStatus: ctx.semesterStatus,
                projectStatus: ctx.projectStatus,
              },
            );
        subjectProgress = progress.subjectProgress;
        projectProgress = progress.projectProgress;
      }

      return {
        countUpdated: updatedItemIds.length,
        subjectId: ctx.subjectId,
        projectId: ctx.projectId,
        alreadyApproved: updatedItemIds.length === 0,
        updatedItemIds,
        subjectProgress,
        projectProgress,
      };
    });
  }

  private async loadChecklistStatusContext(
    checklistItemId: string,
    manager: EntityManager,
  ): Promise<ChecklistStatusContextRow | null> {
    const raw = await manager
      .getRepository(ChecklistItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.subject', 'subject')
      .innerJoin('subject.project', 'project')
      .innerJoin('subject.semester', 'semester')
      .leftJoin('project.productOwner', 'productOwner')
      .leftJoin('project.factoryOwner', 'factoryOwner')
      .select([
        'item.id AS "itemId"',
        'item.status AS "checklistStatus"',
        'item.ownerRole AS "ownerRole"',
        'subject.id AS "subjectId"',
        'subject.status AS "subjectStatus"',
        'subject.progress AS "subjectProgress"',
        'subject.operationalState AS "subjectOperationalState"',
        'semester.id AS "semesterId"',
        'semester.status AS "semesterStatus"',
        'project.id AS "projectId"',
        'project.status AS "projectStatus"',
        'project.progress AS "projectProgress"',
        'project.legacyWorkflow AS "projectLegacyWorkflow"',
        'productOwner.id AS "productOwnerId"',
        'factoryOwner.id AS "factoryOwnerId"',
      ])
      .where('item.id = :checklistItemId', { checklistItemId })
      .andWhere('subject.deletedAt IS NULL')
      .getRawOne<ChecklistStatusContextRow>();

    return raw ?? null;
  }

  private assertCanModifyProjectContext(row: ChecklistStatusContextRow, user: UserEntity): void {
    if (row.projectStatus === ProjectStatus.CLOSED) {
      throw new ForbiddenException('Project is closed');
    }

    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.PRODUCT) {
      if (row.productOwnerId === user.id) return;
      throw new ForbiddenException();
    }

    if (user.role === UserRole.FABRICA) {
      const visibleStatuses: ProjectStatus[] = [
        ProjectStatus.READY_FOR_PRODUCTION,
        ProjectStatus.IN_PRODUCTION,
        ProjectStatus.FEEDBACK_PENDING,
        ProjectStatus.IN_REVIEW,
      ];
      const isAssigned = row.factoryOwnerId === user.id;
      const isUnassignedVisible =
        !row.factoryOwnerId && visibleStatuses.includes(row.projectStatus);
      if (isAssigned || isUnassignedVisible) return;
    }

    throw new ForbiddenException();
  }

  private buildChecklistStatusResponse(
    row: ChecklistStatusContextRow,
    status: ChecklistStatus,
  ): ChecklistStatusUpdateResponseDto {
    return {
      checklistItemId: row.itemId,
      checklistStatus: status,
      subjectId: row.subjectId,
      subjectStatus: row.subjectStatus,
      subjectProgress: Number(row.subjectProgress),
      semesterId: row.semesterId,
      semesterStatus: row.semesterStatus,
      projectId: row.projectId,
      projectStatus: row.projectStatus,
      projectProgress: Number(row.projectProgress),
    };
  }

  private async loadBulkApproveContext(
    subjectId: string,
    manager: EntityManager,
  ): Promise<BulkApproveContextRow | null> {
    const raw = await manager
      .getRepository(SubjectEntity)
      .createQueryBuilder('s')
      .innerJoin('s.project', 'p')
      .innerJoin('s.semester', 'sem')
      .select('s.id', 'subjectId')
      .addSelect('s.status', 'subjectStatus')
      .addSelect('s.progress', 'subjectProgress')
      .addSelect('s.operationalState', 'subjectOperationalState')
      .addSelect('sem.id', 'semesterId')
      .addSelect('sem.status', 'semesterStatus')
      .addSelect('p.id', 'projectId')
      .addSelect('p.status', 'projectStatus')
      .addSelect('p.progress', 'projectProgress')
      .addSelect('p.legacyWorkflow', 'projectLegacyWorkflow')
      .addSelect('p.productOwnerId', 'productOwnerId')
      .addSelect('p.factoryOwnerId', 'factoryOwnerId')
      .where('s.id = :subjectId', { subjectId })
      .andWhere('s.deletedAt IS NULL')
      .getRawOne<{
        subjectId: string;
        subjectStatus: SubjectStatus;
        subjectProgress: string | number;
        subjectOperationalState: InstitutionalOperationalState;
        semesterId: string;
        semesterStatus: SemesterStatus;
        projectId: string;
        projectStatus: ProjectStatus;
        projectProgress: string | number;
        projectLegacyWorkflow: boolean;
        productOwnerId: string | null;
        factoryOwnerId: string | null;
      }>();

    if (!raw) return null;

    return {
      subjectId: raw.subjectId,
      subjectStatus: raw.subjectStatus,
      subjectProgress: Number(raw.subjectProgress ?? 0),
      subjectOperationalState: raw.subjectOperationalState,
      semesterId: raw.semesterId,
      semesterStatus: raw.semesterStatus,
      projectId: raw.projectId,
      projectStatus: raw.projectStatus,
      projectProgress: Number(raw.projectProgress ?? 0),
      projectLegacyWorkflow: Boolean(raw.projectLegacyWorkflow),
      productOwnerId: raw.productOwnerId,
      factoryOwnerId: raw.factoryOwnerId,
    };
  }

  private projectFromBulkApproveContext(ctx: BulkApproveContextRow): ProjectEntity {
    return {
      id: ctx.projectId,
      status: ctx.projectStatus,
      legacyWorkflow: ctx.projectLegacyWorkflow,
      productOwner: ctx.productOwnerId ? ({ id: ctx.productOwnerId } as UserEntity) : null,
      factoryOwner: ctx.factoryOwnerId ? ({ id: ctx.factoryOwnerId } as UserEntity) : null,
    } as ProjectEntity;
  }

  private async loadScopedChecklistItemsForBulk(
    dto: BulkApproveSectionDto,
    manager: EntityManager,
  ): Promise<ChecklistItemEntity[]> {
    const qb = manager
      .getRepository(ChecklistItemEntity)
      .createQueryBuilder('item')
      .select('item.id', 'id')
      .addSelect('item.status', 'status')
      .addSelect('item.ownerRole', 'ownerRole')
      .addSelect('item.label', 'label')
      .addSelect('item.topicId', 'topicId')
      .where('item.subjectId = :subjectId', { subjectId: dto.subjectId });

    this.applyBulkScopeToChecklistQuery(qb, dto);

    const rows = await qb.getRawMany<{
      id: string;
      status: ChecklistStatus;
      ownerRole: UserRole;
      label: string;
      topicId: string | null;
    }>();

    return rows.map(
      (row) =>
        ({
          id: row.id,
          status: row.status,
          ownerRole: row.ownerRole,
          label: row.label,
          topic: row.topicId ? { id: row.topicId } : null,
        }) as ChecklistItemEntity,
    );
  }

  private applyBulkScopeToChecklistQuery(
    qb: SelectQueryBuilder<ChecklistItemEntity>,
    dto: BulkApproveSectionDto,
  ): void {
    switch (dto.scope) {
      case BulkApproveSectionScope.SUBJECT:
        qb.andWhere('item.topicId IS NULL').andWhere('item.ownerRole = :productRole', {
          productRole: UserRole.PRODUCT,
        });
        return;
      case BulkApproveSectionScope.CATEGORY: {
        const categoryId = dto.category?.trim();
        if (!categoryId) {
          throw new BadRequestException('category is required when scope is CATEGORY');
        }
        const labels = CHECKLIST_CATEGORY_LABELS[categoryId];
        if (!labels?.length) {
          throw new BadRequestException(`Invalid checklist category: ${categoryId}`);
        }
        qb.andWhere('item.topicId IS NULL')
          .andWhere('item.ownerRole = :productRole', { productRole: UserRole.PRODUCT })
          .andWhere('LOWER(TRIM(item.label)) IN (:...categoryLabels)', {
            categoryLabels: labels.map((label) => label.trim().toLowerCase()),
          });
        return;
      }
      case BulkApproveSectionScope.TOPIC:
        if (!dto.topicId) {
          throw new BadRequestException('topicId is required when scope is TOPIC');
        }
        qb.andWhere('item.topicId = :topicId', { topicId: dto.topicId });
        return;
      default:
        throw new BadRequestException('Invalid bulk approve scope');
    }
  }

  private isInstitutionalAcademicChecklist(params: {
    operationalState: InstitutionalOperationalState | null;
    projectLegacyWorkflow: boolean;
  }): boolean {
    return (
      isInstitutionalWorkflowEnabled() &&
      !params.projectLegacyWorkflow &&
      params.operationalState != null &&
      isAcademicChecklistEditable(params.operationalState)
    );
  }

  private async recalculateWorkflowAfterChecklistChange(
    subjectId: string,
    semesterId: string,
    projectId: string,
    userId: string,
    manager: EntityManager,
    knownStatuses?: {
      subjectStatus?: SubjectStatus;
      semesterStatus?: SemesterStatus;
      projectStatus?: ProjectStatus;
    },
  ): Promise<{ subjectProgress: number; projectProgress: number }> {
    const subjectProgress = await this.progressService.calculateSubjectProgress(
      subjectId,
      manager,
    );
    await this.subjectWorkflowService.updateSubjectStatus(
      subjectId,
      userId,
      manager,
      knownStatuses?.subjectStatus,
    );
    await this.semesterWorkflowService.updateSemesterStatus(
      semesterId,
      userId,
      manager,
      knownStatuses?.semesterStatus,
    );
    await this.projectWorkflowService.updateProjectStatus(
      projectId,
      userId,
      manager,
      knownStatuses?.projectStatus,
    );
    const projectProgress = await this.progressService.calculateProjectProgress(
      projectId,
      manager,
    );
    return { subjectProgress, projectProgress };
  }

  private async assertProductAcademicChecklistAllowed(
    subjectId: string,
    manager: EntityManager,
    subjectPrefetched?: Pick<SubjectEntity, 'id' | 'operationalState'> & {
      project: Pick<SubjectEntity['project'], 'legacyWorkflow'>;
    },
  ): Promise<void> {
    if (!isInstitutionalWorkflowEnabled()) return;
    const subject =
      subjectPrefetched ??
      (await manager.getRepository(SubjectEntity).findOne({
        where: { id: subjectId },
        relations: { project: true },
      }));
    if (!subject || subject.project.legacyWorkflow) return;
    if (!isAcademicChecklistEditable(subject.operationalState)) {
      throw new ForbiddenException(ACADEMIC_REVIEW_BLOCKED_MESSAGE);
    }
  }
}
