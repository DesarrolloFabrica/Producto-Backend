import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import { labelBelongsToChecklistCategory } from './checklist.constants';
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

const SUBJECT_REVIEWABLE_STATUSES = new Set<SubjectStatus>([
  SubjectStatus.IN_REVIEW,
  SubjectStatus.CHANGES_REQUESTED,
  SubjectStatus.SUBMITTED,
]);

interface ChecklistStatusContextRow {
  itemId: string;
  checklistStatus: ChecklistStatus;
  ownerRole: UserRole;
  subjectId: string;
  subjectStatus: SubjectStatus;
  subjectProgress: number;
  semesterId: string;
  semesterStatus: SemesterStatus;
  projectId: string;
  projectStatus: ProjectStatus;
  projectProgress: number;
  productOwnerId: string | null;
  factoryOwnerId: string | null;
}

@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name);

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
      const timings = {
        loadItem: 0,
        validateSubject: 0,
        validateTransition: 0,
        updateStatus: 0,
        recalculateProgress: 0,
        notifications: 0,
        history: 0,
        dto: 0,
        total: 0,
      };
      const totalStart = Date.now();

      const loadItemStart = Date.now();
      const row = await this.loadChecklistStatusContext(checklistItemId, manager);
      timings.loadItem = Date.now() - loadItemStart;

      if (!row) {
        throw new NotFoundException('Checklist item not found');
      }

      const validateSubjectStart = Date.now();
      this.assertCanModifyProjectContext(row, user);
      timings.validateSubject = Date.now() - validateSubjectStart;

      const previousStatus = row.checklistStatus;
      const validateTransitionStart = Date.now();
      if (previousStatus !== dto.status) {
        assertChecklistStatusTransition(user.role, previousStatus, dto.status, row.ownerRole);
      }
      timings.validateTransition = Date.now() - validateTransitionStart;

      if (previousStatus === dto.status) {
        const dtoStart = Date.now();
        const result = this.buildChecklistStatusResponse(row, previousStatus);
        timings.dto = Date.now() - dtoStart;
        timings.total = Date.now() - totalStart;
        this.logStatusUpdateTiming(checklistItemId, timings);
        return result;
      }

      const updateStatusStart = Date.now();
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
      timings.updateStatus = Date.now() - updateStatusStart;

      const historyStart = Date.now();
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
      timings.history = Date.now() - historyStart;

      const recalculateProgressStart = Date.now();
      const subjectProgress = await this.progressService.calculateSubjectProgress(
        row.subjectId,
        manager,
      );
      const subjectStatus = await this.subjectWorkflowService.updateSubjectStatus(
        row.subjectId,
        user.id,
        manager,
        row.subjectStatus,
      );
      const semesterStatus = await this.semesterWorkflowService.updateSemesterStatus(
        row.semesterId,
        user.id,
        manager,
        row.semesterStatus,
      );
      const projectStatus = await this.projectWorkflowService.updateProjectStatus(
        row.projectId,
        user.id,
        manager,
        row.projectStatus,
      );
      const projectProgress = await this.progressService.calculateProjectProgress(
        row.projectId,
        manager,
      );
      timings.recalculateProgress = Date.now() - recalculateProgressStart;

      const dtoStart = Date.now();
      const result = {
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
      timings.dto = Date.now() - dtoStart;
      timings.total = Date.now() - totalStart;
      this.logStatusUpdateTiming(checklistItemId, timings);

      return result;
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
      const timings = {
        loadSubject: 0,
        validateState: 0,
        loadItems: 0,
        updateItems: 0,
        dto: 0,
        total: 0,
      };
      const totalStart = Date.now();
      const checklistRepo = manager.getRepository(ChecklistItemEntity);
      const subjectRepo = manager.getRepository(SubjectEntity);

      const loadSubjectStart = Date.now();
      const subject = await subjectRepo.findOne({
        where: { id: dto.subjectId },
        relations: {
          project: { productOwner: true, factoryOwner: true },
          semester: true,
          checklist: { topic: true },
        },
      });
      timings.loadSubject = Date.now() - loadSubjectStart;

      if (!subject) {
        throw new NotFoundException('Subject not found');
      }

      const project = subject.project;
      this.projectsService.assertCanModifyProject(project, user);
      if (user.role === UserRole.PRODUCT) {
        this.projectsService.assertCanManageAsProductOwner(project, user);
      }

      const validateStateStart = Date.now();
      if (!SUBJECT_REVIEWABLE_STATUSES.has(subject.status)) {
        throw new BadRequestException(
          'Subject must be IN_REVIEW, CHANGES_REQUESTED or SUBMITTED for bulk approval',
        );
      }
      timings.validateState = Date.now() - validateStateStart;

      const loadItemsStart = Date.now();
      const scopedItems = this.filterItemsForBulkScope(subject.checklist ?? [], dto);
      const toUpdate = scopedItems.filter(isEligibleForProductBulkApprove);
      timings.loadItems = Date.now() - loadItemsStart;

      const updateItemsStart = Date.now();
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
      timings.updateItems = Date.now() - updateItemsStart;

      if (updatedItemIds.length > 0) {
        await this.auditService.createLog(
          {
            entityType: RelatedEntityType.SUBJECT,
            entityId: subject.id,
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

        await this.recalculateWorkflowAfterChecklistChange(
          subject.id,
          subject.semester.id,
          project.id,
          user.id,
          manager,
          {
            subjectStatus: subject.status,
            semesterStatus: subject.semester.status,
            projectStatus: project.status,
          },
        );
      }

      const result = {
        countUpdated: updatedItemIds.length,
        subjectId: subject.id,
        projectId: project.id,
        alreadyApproved: updatedItemIds.length === 0,
        updatedItemIds,
      };

      timings.dto = 0;
      timings.total = Date.now() - totalStart;

      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(
          `bulkApproveSection(${dto.subjectId},${dto.scope}) ` +
            `loadSubject=${timings.loadSubject}ms ` +
            `validateState=${timings.validateState}ms ` +
            `loadItems=${timings.loadItems}ms ` +
            `updateItems=${timings.updateItems}ms ` +
            `dto=${timings.dto}ms ` +
            `total=${timings.total}ms`,
        );
      }

      return result;
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
        'semester.id AS "semesterId"',
        'semester.status AS "semesterStatus"',
        'project.id AS "projectId"',
        'project.status AS "projectStatus"',
        'project.progress AS "projectProgress"',
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

  private logStatusUpdateTiming(
    checklistItemId: string,
    timings: {
      loadItem: number;
      validateSubject: number;
      validateTransition: number;
      updateStatus: number;
      recalculateProgress: number;
      notifications: number;
      history: number;
      dto: number;
      total: number;
    },
  ): void {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.debug(
      `statusUpdate(${checklistItemId}) ` +
        `loadItem=${timings.loadItem}ms ` +
        `validateSubject=${timings.validateSubject}ms ` +
        `validateTransition=${timings.validateTransition}ms ` +
        `updateStatus=${timings.updateStatus}ms ` +
        `recalculateProgress=${timings.recalculateProgress}ms ` +
        `notifications=${timings.notifications}ms ` +
        `history=${timings.history}ms ` +
        `dto=${timings.dto}ms ` +
        `total=${timings.total}ms`,
    );
  }

  private filterItemsForBulkScope(
    items: ChecklistItemEntity[],
    dto: BulkApproveSectionDto,
  ): ChecklistItemEntity[] {
    switch (dto.scope) {
      case BulkApproveSectionScope.SUBJECT:
        return items.filter((item) => !item.topic?.id && item.ownerRole === UserRole.PRODUCT);
      case BulkApproveSectionScope.CATEGORY: {
        if (!dto.category?.trim()) {
          throw new BadRequestException('category is required when scope is CATEGORY');
        }
        return items.filter(
          (item) =>
            !item.topic?.id &&
            item.ownerRole === UserRole.PRODUCT &&
            labelBelongsToChecklistCategory(item.label, dto.category!.trim()),
        );
      }
      case BulkApproveSectionScope.TOPIC: {
        if (!dto.topicId) {
          throw new BadRequestException('topicId is required when scope is TOPIC');
        }
        return items.filter((item) => item.topic?.id === dto.topicId);
      }
      default:
        throw new BadRequestException('Invalid bulk approve scope');
    }
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
  ): Promise<void> {
    await this.progressService.calculateSubjectProgress(subjectId, manager);
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
    await this.progressService.calculateProjectProgress(projectId, manager);
  }
}
