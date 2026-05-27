import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { AuditService } from '../audit/audit.service';
import { StatusHistoryService } from '../audit/status-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ObservationsService } from '../observations/observations.service';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { ProjectActionResponseDto } from './dto/project-action-response.dto';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import {
  SUBJECT_CHECKLIST_LABELS,
  TOPIC_CHECKLIST_LABELS,
} from '../checklist/checklist.constants';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { SubjectMatterExpertStatus } from '../common/enums/subject-matter-expert-status.enum';
import { SubjectMatterExpertType } from '../common/enums/subject-matter-expert-type.enum';
import { assertSubjectTopicsCount } from '../common/utils/subject-topics.util';
import {
  isProjectActiveForFactory,
  resolveActivationOnCreate,
  resolveActivationOnExpertConfirm,
} from '../common/utils/project-sme.util';
import {
  ChecklistItemDto,
  ProjectDetailDto,
  ProjectLinkDto,
  ProjectListItemDto,
  ProjectOwnerDto,
  SemesterDetailDto,
  SubjectDetailDto,
  SubjectSummaryDto,
  TopicDetailDto,
} from './dto/project-response.dto';
import { ProjectChangeTimelineEntryDto } from './dto/project-change-tracking.dto';
import { LinkResourceEntity } from './link-resource.entity';
import { MailService } from '../mail/mail.service';
import { AddSemesterDto } from '../semesters/dto/add-semester.dto';
import { ProjectEntity } from './project.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { loadProductObservationCountsBySubject } from '../observations/observation-subject-query.util';
import { deriveSubjectOperationalState } from '../factory/utils/operational-state.util';
import { InstitutionalWorkflowService } from '../institutional-workflow/institutional-workflow.service';
import { SemesterOperationalWorkflowService } from '../institutional-workflow/semester-operational-workflow.service';
import { isInstitutionalWorkflowEnabled } from '../institutional-workflow/institutional-workflow.config';
import { statesPendingForRole } from '../institutional-workflow/institutional-workflow.transitions';

interface ProjectBaseRow {
  id: string;
  school: string;
  program: string;
  modality: ProjectEntity['modality'];
  requestType: string;
  priority: ProjectEntity['priority'];
  status: ProjectStatus;
  progress: number;
  expectedDeliveryDate: Date | null;
  activatedAt: Date | null;
  subjectMatterExpertType: ProjectEntity['subjectMatterExpertType'];
  subjectMatterExpertStatus: ProjectEntity['subjectMatterExpertStatus'];
  expertConfirmedAt: Date | null;
  observations: string | null;
  createdAt: Date;
  updatedAt: Date;
  productOwnerId: string;
  factoryOwnerId: string | null;
  legacyWorkflow: boolean;
}

interface ProjectOwnerRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface ProjectSemesterRow {
  id: string;
  projectId: string;
  semesterNumber: number;
  status: SemesterEntity['status'];
  createdFromChange: boolean;
  factoryExpectedDate: Date | null;
  continuationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectSubjectRow {
  id: string;
  projectId: string;
  semesterId: string;
  name: string;
  expectedDeliveryDate: Date | null;
  status: SubjectStatus;
  progress: number;
  factoryProductionStatus: string | null;
  factoryProductionCompletedAt: Date | null;
  createdFromChange: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectTopicRow {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectChecklistRow {
  id: string;
  subjectId: string;
  topicId: string | null;
  category: string | null;
  label: string;
  status: ChecklistStatus;
  ownerRole: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectLinkRow {
  id: string;
  projectId: string;
  title: string;
  url: string;
  type: string;
  uploadedBy: UserRole;
  createdAt: Date;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly statusHistoryService: StatusHistoryService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
    private readonly notificationsService: NotificationsService,
    private readonly progressService: ProgressService,
    private readonly projectWorkflowService: ProjectWorkflowService,
    private readonly mailService: MailService,
    private readonly institutionalWorkflowService: InstitutionalWorkflowService,
    private readonly semesterOperationalWorkflowService: SemesterOperationalWorkflowService,
  ) {}

  assertCanCreateProject(user: UserEntity): void {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can create projects');
    }
  }

  assertCanViewProject(project: ProjectEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN) return;

    if (user.role === UserRole.PRODUCT) {
      if (project.productOwner?.id === user.id) return;
      throw new ForbiddenException();
    }

    if (user.role === UserRole.FABRICA) {
      const isAssigned = project.factoryOwner?.id === user.id;
      const visibleStatuses: ProjectStatus[] = [
        ProjectStatus.READY_FOR_PRODUCTION,
        ProjectStatus.IN_PRODUCTION,
        ProjectStatus.FEEDBACK_PENDING,
        ProjectStatus.IN_REVIEW,
      ];
      if (!isProjectActiveForFactory(project.subjectMatterExpertStatus)) {
        throw new ForbiddenException();
      }

      const isUnassigned = !project.factoryOwner;
      // Fabrica can always see their assigned projects. Additionally, unassigned projects
      // in the operational pipeline must be visible so they don't disappear after refresh.
      if (isAssigned || (isUnassigned && visibleStatuses.includes(project.status))) return;
      throw new ForbiddenException();
    }

    if (user.role === UserRole.PLANEACION || user.role === UserRole.LMS) {
      if (project.legacyWorkflow) {
        throw new ForbiddenException();
      }
      return;
    }

    throw new ForbiddenException();
  }

  assertCanModifyProject(project: ProjectEntity, user: UserEntity): void {
    if (project.status === ProjectStatus.CLOSED) {
      throw new ForbiddenException('Project is closed');
    }
    this.assertCanViewProject(project, user);
  }

  assertCanManageAsProductOwner(project: ProjectEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.PRODUCT && project.productOwner?.id === user.id) return;
    throw new ForbiddenException('Only product owner or admin can perform this action');
  }

  private buildProjectQueryByRole(
    user: UserEntity,
  ): SelectQueryBuilder<ProjectEntity> {
    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.productOwner', 'productOwner')
      .leftJoinAndSelect('project.factoryOwner', 'factoryOwner')
      .where('project.deletedAt IS NULL');

    if (user.role === UserRole.ADMIN) {
      return qb;
    }

    if (user.role === UserRole.PRODUCT) {
      return qb.andWhere('project.productOwnerId = :userId', { userId: user.id });
    }

    if (user.role === UserRole.FABRICA) {
      return qb
        .andWhere('project.subjectMatterExpertStatus = :smeReady', {
          smeReady: SubjectMatterExpertStatus.READY,
        })
        .andWhere(
          new Brackets((sub) => {
            sub
              .where('project.factoryOwnerId = :userId', { userId: user.id })
              .orWhere(
                new Brackets((unassigned) => {
                  unassigned
                    .where('project.factoryOwnerId IS NULL')
                    .andWhere('project.status IN (:...visibleStatuses)', {
                      visibleStatuses: [
                        ProjectStatus.READY_FOR_PRODUCTION,
                        ProjectStatus.IN_PRODUCTION,
                        ProjectStatus.FEEDBACK_PENDING,
                        ProjectStatus.IN_REVIEW,
                      ],
                    });
                }),
              );
          }),
        );
    }

    if (user.role === UserRole.PLANEACION || user.role === UserRole.LMS) {
      const instStates = statesPendingForRole(user.role);
      return qb
        .innerJoin('project.subjects', 'instSubject', 'instSubject.deletedAt IS NULL')
        .andWhere('project.legacyWorkflow = false')
        .andWhere('instSubject.operational_state IN (:...instStates)', { instStates })
        .distinct(true);
    }

    throw new ForbiddenException();
  }

  async findAll(user: UserEntity): Promise<ProjectListItemDto[]> {
    const projects = await this.buildProjectQueryByRole(user)
      .orderBy('project.createdAt', 'DESC')
      .getMany();

    const includeSubjectsSummary =
      user.role === UserRole.FABRICA ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.PRODUCT ||
      user.role === UserRole.PLANEACION ||
      user.role === UserRole.LMS;
    const summariesByProject = includeSubjectsSummary
      ? await this.loadSubjectsSummaryForProjects(projects.map((p) => p.id))
      : new Map<string, SubjectSummaryDto[]>();

    return projects.map((p) => ({
      ...this.toListItem(p),
      ...(includeSubjectsSummary
        ? { subjectsSummary: summariesByProject.get(p.id) ?? [] }
        : {}),
    }));
  }

  private async loadSubjectsSummaryForProjects(
    projectIds: string[],
  ): Promise<Map<string, SubjectSummaryDto[]>> {
    const result = new Map<string, SubjectSummaryDto[]>();
    if (!projectIds.length) return result;

    const rows = await this.subjectRepo
      .createQueryBuilder('subject')
      .innerJoin('subject.semester', 'semester')
      .innerJoin('subject.project', 'project')
      .where('subject.projectId IN (:...projectIds)', { projectIds })
      .andWhere('subject.deletedAt IS NULL')
      .select('subject.id', 'id')
      .addSelect('subject.name', 'name')
      .addSelect('subject.status', 'status')
      .addSelect('subject.progress', 'progress')
      .addSelect('subject.expectedDeliveryDate', 'expectedDeliveryDate')
      .addSelect('subject.updatedAt', 'updatedAt')
      .addSelect('subject.createdFromChange', 'createdFromChange')
      .addSelect('subject.projectId', 'projectId')
      .addSelect('semester.semesterNumber', 'semesterNumber')
      .addSelect('semester.factoryExpectedDate', 'semesterFactoryExpectedDate')
      .addSelect('project.expectedDeliveryDate', 'projectExpectedDeliveryDate')
      .orderBy('subject.updatedAt', 'DESC')
      .getRawMany<{
        id: string;
        name: string;
        status: SubjectStatus;
        progress: number;
        expectedDeliveryDate: Date | null;
        updatedAt: Date;
        createdFromChange: boolean;
        projectId: string;
        projectStatus: ProjectStatus;
        semesterNumber: number;
        semesterFactoryExpectedDate: Date | null;
        projectExpectedDeliveryDate: Date;
      }>();

    const subjectIds = rows.map((s) => s.id);
    let obsCountMap = new Map<
      string,
      { open: number; correctionSent: number }
    >();

    if (subjectIds.length) {
      obsCountMap = await loadProductObservationCountsBySubject(
        this.dataSource.getRepository(ObservationEntity),
        subjectIds,
      );
    }

    for (const row of rows) {
      const projectSummaries = result.get(row.projectId) ?? [];
      if (projectSummaries.some((entry) => entry.id === row.id)) {
        continue;
      }
      const obsCounts = obsCountMap.get(row.id) ?? {
        open: 0,
        correctionSent: 0,
      };
      const summary: SubjectSummaryDto = {
        id: row.id,
        name: row.name,
        status: row.status,
        operationalState: deriveSubjectOperationalState({
          subjectStatus: row.status,
          projectStatus: row.projectStatus,
          openObservationsCount: obsCounts.open,
          correctionSentCount: obsCounts.correctionSent,
        }),
        semesterNumber: row.semesterNumber,
        createdFromChange: Boolean(row.createdFromChange),
        expectedDeliveryDate:
          row.expectedDeliveryDate ??
          row.semesterFactoryExpectedDate ??
          row.projectExpectedDeliveryDate,
        progress: row.progress,
        openObservationsCount: obsCounts.open,
        correctionSentCount: obsCounts.correctionSent,
        updatedAt: row.updatedAt,
      };
      projectSummaries.push(summary);
      result.set(row.projectId, projectSummaries);
    }

    return result;
  }

  async findOne(
    id: string,
    user: UserEntity,
    options?: { includeTimeline?: boolean },
  ): Promise<ProjectDetailDto> {
    const projectRows = await this.dataSource.query<ProjectBaseRow[]>(
      `
        SELECT
          p.id,
          p.school,
          p.program,
          p.modality,
          p."requestType",
          p.priority,
          p.status,
          p.progress,
          p."expectedDeliveryDate",
          p."activatedAt",
          p."subjectMatterExpertType",
          p."subjectMatterExpertStatus",
          p."expertConfirmedAt",
          p.observations,
          p."createdAt",
          p."updatedAt",
          p."productOwnerId",
          p."factoryOwnerId",
          p.legacy_workflow AS "legacyWorkflow"
        FROM projects p
        WHERE p.id = $1
          AND p."deletedAt" IS NULL
        LIMIT 1
      `,
      [id],
    );
    const project = projectRows[0];

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ownerIds = [project.productOwnerId, project.factoryOwnerId].filter(Boolean);
    const ownerRows = await this.dataSource.query<ProjectOwnerRow[]>(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = ANY($1::uuid[])
      `,
      [ownerIds],
    );
    const ownersById = new Map(ownerRows.map((owner) => [owner.id, owner]));
    const productOwner = ownersById.get(project.productOwnerId);
    const factoryOwner = project.factoryOwnerId ? ownersById.get(project.factoryOwnerId) ?? null : null;

    if (!productOwner) {
      throw new NotFoundException('Project owner not found');
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isProductOwner = user.role === UserRole.PRODUCT && project.productOwnerId === user.id;
    const isFactoryOwner = user.role === UserRole.FABRICA && project.factoryOwnerId === user.id;

    const visibleStatuses: ProjectStatus[] = [
      ProjectStatus.READY_FOR_PRODUCTION,
      ProjectStatus.IN_PRODUCTION,
      ProjectStatus.FEEDBACK_PENDING,
      ProjectStatus.IN_REVIEW,
    ];
    const isVisibleUnassignedFactoryProject =
      user.role === UserRole.FABRICA &&
      !project.factoryOwnerId &&
      visibleStatuses.includes(project.status);

    const isInstitutionalReader =
      (user.role === UserRole.PLANEACION || user.role === UserRole.LMS) && !project.legacyWorkflow;

    if (
      !isAdmin &&
      !isProductOwner &&
      !isFactoryOwner &&
      !isVisibleUnassignedFactoryProject &&
      !isInstitutionalReader
    ) {
      throw new ForbiddenException();
    }

    const semesters = await this.dataSource.query<ProjectSemesterRow[]>(
      `
        SELECT
          sem.id,
          sem."projectId",
          sem."semesterNumber",
          sem.status,
          sem."created_from_change" AS "createdFromChange",
          sem."factoryExpectedDate",
          sem."continuationDate",
          sem."createdAt",
          sem."updatedAt"
        FROM semesters sem
        WHERE sem."projectId" = $1
          AND sem."deletedAt" IS NULL
        ORDER BY sem."semesterNumber" ASC
      `,
      [project.id],
    );

    const semesterIds = semesters.map((semester) => semester.id);
    const subjects = semesterIds.length
      ? await this.dataSource.query<ProjectSubjectRow[]>(
          `
            SELECT
              s.id,
              s."projectId",
              s."semesterId",
              s.name,
              s."expectedDeliveryDate",
              s.status,
              s.progress,
              s."factory_production_status" AS "factoryProductionStatus",
              s."factory_production_completed_at" AS "factoryProductionCompletedAt",
              s."created_from_change" AS "createdFromChange",
              s."createdAt",
              s."updatedAt"
            FROM subjects s
            WHERE s."semesterId" = ANY($1::uuid[])
              AND s."deletedAt" IS NULL
            ORDER BY s.name ASC
          `,
          [semesterIds],
        )
      : [];

    const subjectIds = subjects.map((subject) => subject.id);
    const topics = subjectIds.length
      ? await this.dataSource.query<ProjectTopicRow[]>(
          `
            SELECT id, "subjectId", name, "order", "createdAt", "updatedAt"
            FROM topics
            WHERE "subjectId" = ANY($1::uuid[])
              AND "deletedAt" IS NULL
            ORDER BY "subjectId" ASC, "order" ASC
          `,
          [subjectIds],
        )
      : [];

    const checklist = subjectIds.length
      ? await this.dataSource.query<ProjectChecklistRow[]>(
          `
            SELECT id, "subjectId", "topicId", category, label, status, "ownerRole", "createdAt", "updatedAt"
            FROM checklist_items
            WHERE "subjectId" = ANY($1::uuid[])
            ORDER BY "subjectId" ASC, "topicId" ASC NULLS FIRST, label ASC
          `,
          [subjectIds],
        )
      : [];

    const links = await this.dataSource.query<ProjectLinkRow[]>(
      `
        SELECT id, "projectId", title, url, type, "uploadedBy", "createdAt"
        FROM link_resources
        WHERE "projectId" = $1
        ORDER BY "createdAt" ASC
      `,
      [project.id],
    );

    const obsCountMap = await loadProductObservationCountsBySubject(
      this.dataSource.getRepository(ObservationEntity),
      subjectIds,
    );

    const timeline =
      options?.includeTimeline === false
        ? []
        : await this.auditService.getProjectChangeTimeline(project.id);

    return this.buildProjectDetailFromRows({
      project,
      productOwner,
      factoryOwner,
      semesters,
      subjects,
      topics,
      checklist,
      links,
      obsCountMap,
      timeline,
    });
  }

  async create(dto: CreateProjectDto, user: UserEntity): Promise<ProjectDetailDto> {
    this.assertCanCreateProject(user);

    const productOwnerId = this.resolveProductOwnerId(dto, user);
    await this.validateProductOwner(productOwnerId);

    let resolvedFactoryOwnerId: string | null = dto.factoryOwnerId ?? null;
    if (resolvedFactoryOwnerId) {
      await this.validateFactoryOwner(resolvedFactoryOwnerId);
    } else {
      const fallbackFactory = await this.dataSource.getRepository(UserEntity).findOne({
        where: { role: UserRole.FABRICA, status: UserStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
      resolvedFactoryOwnerId = fallbackFactory?.id ?? null;
    }

    this.validateSemesterNumbers(dto);
    for (const semester of dto.semesters) {
      this.assertSubjectsTopicsCountIfProvided(semester.subjects);
    }

    const activation = resolveActivationOnCreate(dto.subjectMatterExpertType);

    const projectId = await this.dataSource.transaction(async (manager) => {
      const projectRepository = manager.getRepository(ProjectEntity);
      const linkRepository = manager.getRepository(LinkResourceEntity);
      const semesterRepository = manager.getRepository(SemesterEntity);
      const subjectRepository = manager.getRepository(SubjectEntity);
      const topicRepository = manager.getRepository(TopicEntity);
      const checklistRepository = manager.getRepository(ChecklistItemEntity);

       const project = await projectRepository.save(
         projectRepository.create({
          school: dto.school,
          program: dto.program,
          modality: dto.modality,
          requestType: dto.requestType,
          priority: dto.priority,
          subjectMatterExpertType: dto.subjectMatterExpertType,
          subjectMatterExpertStatus: activation.subjectMatterExpertStatus,
          status: activation.status,
          progress: 0,
          activatedAt: activation.activatedAt,
          expertConfirmedAt: activation.expertConfirmedAt,
          expectedDeliveryDate: activation.expectedDeliveryDate,
           observations: dto.observations ?? null,
           productOwner: { id: productOwnerId },
           factoryOwner: resolvedFactoryOwnerId ? { id: resolvedFactoryOwnerId } : null,
           institutionalState: isInstitutionalWorkflowEnabled()
             ? ProjectInstitutionalState.INSTITUTIONAL_IN_PROGRESS
             : null,
         }),
       );

      if (dto.syllabus?.hasSyllabus && dto.syllabus.url) {
        await linkRepository.save(
          linkRepository.create({
            project: { id: project.id },
            title: 'Syllabus',
            url: dto.syllabus.url,
            type: 'SYLLABUS',
            uploadedBy: user.role,
          }),
        );
      }

      const checklistBatch: Array<{
        subjectId: string;
        topicId: string | null;
        label: string;
        status: ChecklistStatus;
        ownerRole: UserRole;
      }> = [];

      for (const semesterDto of dto.semesters) {
        const semester = await semesterRepository.save(
          semesterRepository.create({
            project: { id: project.id },
            semesterNumber: semesterDto.semesterNumber,
            factoryExpectedDate: activation.expectedDeliveryDate,
            createdFromChange: false,
          }),
        );

        for (const subjectDto of semesterDto.subjects) {
          const subject = await subjectRepository.save(
            subjectRepository.create({
              project: { id: project.id },
              semester: { id: semester.id },
              name: subjectDto.name,
              expectedDeliveryDate: activation.expectedDeliveryDate,
              progress: 0,
              createdFromChange: false,
            }),
          );

          for (const label of SUBJECT_CHECKLIST_LABELS) {
            checklistBatch.push({
              subjectId: subject.id,
              topicId: null,
              label,
              status: ChecklistStatus.PENDIENTE,
              ownerRole: UserRole.PRODUCT,
            });
          }

          const topicNames = (subjectDto.topics ?? []).map((t) => t.trim()).filter(Boolean);
          for (let i = 0; i < topicNames.length; i++) {
            const topicName = topicNames[i];
            const topic = await topicRepository.save(
              topicRepository.create({
                subject: { id: subject.id },
                name: topicName,
                order: i + 1,
              }),
            );

            for (const label of TOPIC_CHECKLIST_LABELS) {
              checklistBatch.push({
                subjectId: subject.id,
                topicId: topic.id,
                label,
                status: ChecklistStatus.PENDIENTE,
                ownerRole: UserRole.FABRICA,
              });
            }
          }
        }

        if (checklistBatch.length > 0) {
          await this.bulkInsertChecklistItems(checklistRepository, checklistBatch);
          checklistBatch.length = 0;
        }

        if (isInstitutionalWorkflowEnabled()) {
          await this.semesterOperationalWorkflowService.initializeSemesterOperational(
            semester.id,
            manager,
            user,
          );
          await this.semesterOperationalWorkflowService.syncSubjectsOperationalStateFromSemester(
            semester.id,
            manager,
          );
        }
      }

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: project.id,
          action: AuditAction.CREATE,
          userId: user.id,
          beforeJson: null,
          afterJson: {
            id: project.id,
            school: project.school,
            program: project.program,
            modality: project.modality,
            requestType: project.requestType,
            priority: project.priority,
            status: project.status,
            productOwnerId,
            factoryOwnerId: dto.factoryOwnerId ?? null,
            semestersCount: dto.semesters.length,
          },
        },
        manager,
      );

      return project.id;
    });

    const detail = await this.findOne(projectId, user, { includeTimeline: false });
    if (activation.shouldNotifyFactory) {
      void this.mailService.sendProductRequestCreatedEmail(detail);
    }
    if (isInstitutionalWorkflowEnabled()) {
      const institutionalNotifyRoles = [
        UserRole.PLANEACION,
        UserRole.FABRICA,
        UserRole.LMS,
      ] as const;
      const roleActionUrls: Record<(typeof institutionalNotifyRoles)[number], string> = {
        [UserRole.PLANEACION]: '/planning/dashboard?filter=initial',
        [UserRole.FABRICA]: '/factory/dashboard',
        [UserRole.LMS]: '/lms/dashboard',
      };
      void this.dataSource
        .transaction(async (manager) => {
          for (const notifyRole of institutionalNotifyRoles) {
            await this.notificationsService.notifyRole(
              notifyRole,
              {
                type:
                  notifyRole === UserRole.PLANEACION
                    ? NotificationType.ACTION
                    : NotificationType.INFO,
                title: 'Nueva solicitud',
                message: `${detail.program} · ${detail.school}`,
                projectId: detail.id,
                eventType: NotificationEventType.INSTITUTIONAL_REQUEST_CREATED,
                actionUrl: roleActionUrls[notifyRole],
              },
              manager,
            );
          }
        })
        .catch(() => undefined);
    }
    return detail;
  }

  async confirmSubjectMatterExpert(
    projectId: string,
    user: UserEntity,
  ): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can confirm subject matter expert');
    }

    const project = await this.projectRepo.findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    this.assertCanManageAsProductOwner(project, user);

    if (project.subjectMatterExpertType !== SubjectMatterExpertType.EXTERNAL) {
      throw new BadRequestException('Only external subject matter expert requests can be confirmed');
    }

    if (project.subjectMatterExpertStatus === SubjectMatterExpertStatus.READY) {
      return await this.findOne(projectId, user);
    }

    const activation = resolveActivationOnExpertConfirm();

    await this.dataSource.transaction(async (manager) => {
      await this.applyProjectActivation(projectId, manager, {
        activatedAt: activation.activatedAt!,
        expectedDeliveryDate: activation.expectedDeliveryDate!,
        status: activation.status,
        subjectMatterExpertStatus: activation.subjectMatterExpertStatus,
        expertConfirmedAt: activation.expertConfirmedAt!,
      });

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.STATUS_CHANGE,
          userId: user.id,
          beforeJson: {
            subjectMatterExpertStatus: SubjectMatterExpertStatus.PENDING,
            status: project.status,
          },
          afterJson: {
            subjectMatterExpertStatus: SubjectMatterExpertStatus.READY,
            status: activation.status,
            expertConfirmedAt: activation.expertConfirmedAt,
            activatedAt: activation.activatedAt,
          },
        },
        manager,
      );

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: project.status,
          toStatus: activation.status,
          changedById: user.id,
        },
        manager,
      );
    });

    const detail = await this.findOne(projectId, user);
    if (activation.shouldNotifyFactory) {
      void this.mailService.sendProductRequestCreatedEmail(detail);
    }
    return detail;
  }

  async addSemesterToProject(projectId: string, dto: AddSemesterDto, user: UserEntity): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can modify semesters');
    }

    this.assertSubjectsTopicsCountIfProvided(dto.subjects);

    const changeSummary = {
      changeType: 'SEMESTER_ADDED',
      semesterNumber: dto.semesterNumber,
      subjectsAdded: dto.subjects.map((subject) => ({
        name: subject.name.trim(),
        topics: (subject.topics ?? []).map((topic) => topic.trim()).filter(Boolean),
      })),
      changeReason: dto.changeReason?.trim() || null,
      changedAt: new Date().toISOString(),
      changedBy: user.id,
    };

    await this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(ProjectEntity);
      const semesterRepo = manager.getRepository(SemesterEntity);
      const subjectRepo = manager.getRepository(SubjectEntity);
      const topicRepo = manager.getRepository(TopicEntity);
      const checklistRepo = manager.getRepository(ChecklistItemEntity);

      const project = await projectRepo.findOne({
        where: { id: projectId, deletedAt: IsNull() },
        relations: { productOwner: true, factoryOwner: true },
      });
      if (!project) throw new NotFoundException('Project not found');

      this.assertCanManageAsProductOwner(project, user);
      this.assertCanModifyProject(project, user);

      if (project.institutionalScopeLockedAt && !project.legacyWorkflow) {
        throw new ConflictException(
          'No se pueden agregar semestres: el alcance de la solicitud quedó bloqueado tras la validación inicial de Planeación.',
        );
      }

      const existingSemester = await semesterRepo.findOne({
        where: { project: { id: projectId }, semesterNumber: dto.semesterNumber, deletedAt: IsNull() },
      });
      if (existingSemester) {
        throw new BadRequestException(`Semester ${dto.semesterNumber} already exists in this project`);
      }

      const currentSemesterCount = await semesterRepo.count({
        where: { project: { id: project.id }, deletedAt: IsNull() },
      });

      const semester = await semesterRepo.save(
        semesterRepo.create({
          project: { id: project.id },
          semesterNumber: dto.semesterNumber,
          factoryExpectedDate: new Date(dto.factoryExpectedDate),
          createdFromChange: true,
        }),
      );

      for (const subjectDto of dto.subjects) {
        const subject = await subjectRepo.save(
          subjectRepo.create({
            project: { id: project.id },
            semester: { id: semester.id },
            name: subjectDto.name.trim(),
            expectedDeliveryDate: new Date(dto.factoryExpectedDate),
            progress: 0,
            status: SubjectStatus.PENDING,
            createdFromChange: true,
          }),
        );

        for (const label of SUBJECT_CHECKLIST_LABELS) {
          await checklistRepo.save(
            checklistRepo.create({
              subject: { id: subject.id },
              topic: null,
              label,
              status: ChecklistStatus.PENDIENTE,
              ownerRole: UserRole.PRODUCT,
            }),
          );
        }

        const topicNames = (subjectDto.topics ?? []).map((t) => t.trim()).filter(Boolean);
        for (let i = 0; i < topicNames.length; i++) {
          const topicName = topicNames[i];
          const topic = await topicRepo.save(
            topicRepo.create({
              subject: { id: subject.id },
              name: topicName,
              order: i + 1,
            }),
          );

          for (const label of TOPIC_CHECKLIST_LABELS) {
            await checklistRepo.save(
              checklistRepo.create({
                subject: { id: subject.id },
                topic: { id: topic.id },
                label,
                status: ChecklistStatus.PENDIENTE,
                ownerRole: UserRole.FABRICA,
              }),
            );
          }
        }
      }

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: project.id,
          action: AuditAction.UPDATE,
          userId: user.id,
          beforeJson: { semesterCount: currentSemesterCount },
          afterJson: changeSummary,
        },
        manager,
      );

      await this.notificationsService.notifyFactoryOwner(
        project.factoryOwner?.id,
        {
          type: NotificationType.ACTION,
          title: 'Nuevo semestre agregado',
          message: `Product agregó un nuevo semestre al programa ${project.program}.`,
          entityType: 'PROJECT',
          entityId: project.id,
          eventType: NotificationEventType.NEW_SEMESTER_ADDED,
          projectId: project.id,
          actionUrl: `/projects/${project.id}/semesters/${dto.semesterNumber}`,
          severity: 'attention',
        },
        manager,
      );

      await this.progressService.calculateProjectProgress(project.id, manager);
    });

    const detail = await this.findOne(projectId, user);
    void this.mailService.sendProductRequestUpdatedEmail(detail, {
      changeType: 'SEMESTER_ADDED',
      description: `Semestre ${dto.semesterNumber} agregado`,
      details: [
        `Semestre ${dto.semesterNumber}`,
        ...dto.subjects.map((subject) => {
          const topics = (subject.topics ?? []).map((topic) => topic.trim()).filter(Boolean);
          const topicsLabel = topics.length > 0 ? topics.join(', ') : 'sin gránulos';
          return `Asignatura: ${subject.name.trim()} (${topicsLabel})`;
        }),
      ],
      changeReason: dto.changeReason?.trim() || null,
      changedBy: `${user.name} <${user.email}>`,
      changedAt: changeSummary.changedAt,
    });
    return detail;
  }

  private resolveProductOwnerId(dto: CreateProjectDto, user: UserEntity): string {
    if (dto.productOwnerId) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only ADMIN can set productOwnerId');
      }
      return dto.productOwnerId;
    }
    return user.id;
  }

  private async validateProductOwner(userId: string): Promise<void> {
    const owner = await this.usersService.findById(userId);
    if (!owner) {
      throw new BadRequestException('productOwnerId not found');
    }
    if (owner.role !== UserRole.PRODUCT && owner.role !== UserRole.ADMIN) {
      throw new BadRequestException('productOwner must have role PRODUCT or ADMIN');
    }
  }

  private async validateFactoryOwner(userId: string): Promise<void> {
    const owner = await this.usersService.findById(userId);
    if (!owner) {
      throw new BadRequestException('factoryOwnerId not found');
    }
    if (owner.role !== UserRole.FABRICA) {
      throw new BadRequestException('factoryOwner must have role FABRICA');
    }
  }

  private assertSubjectsTopicsCountIfProvided(subjects: { topics?: string[] }[]): void {
    for (const subject of subjects) {
      const topics = subject.topics ?? [];
      if (topics.length === 0) continue;
      const count = topics.map((topic) => topic.trim()).filter(Boolean).length;
      assertSubjectTopicsCount(count);
    }
  }

  private validateSemesterNumbers(dto: CreateProjectDto): void {
    const numbers = dto.semesters.map((s) => s.semesterNumber);
    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      throw new BadRequestException('semesterNumber must be unique within the project');
    }
  }

  private buildProjectDetailFromRows(input: {
    project: ProjectBaseRow;
    productOwner: ProjectOwnerRow;
    factoryOwner: ProjectOwnerRow | null;
    semesters: ProjectSemesterRow[];
    subjects: ProjectSubjectRow[];
    topics: ProjectTopicRow[];
    checklist: ProjectChecklistRow[];
    links: ProjectLinkRow[];
    obsCountMap: Map<string, { open: number; correctionSent: number }>;
    timeline: ProjectChangeTimelineEntryDto[];
  }): ProjectDetailDto {
    const semestersById = new Map(input.semesters.map((semester) => [semester.id, semester]));
    const topicsBySubjectId = new Map<string, ProjectTopicRow[]>();
    const checklistBySubjectId = new Map<string, ProjectChecklistRow[]>();
    const checklistByTopicId = new Map<string, ProjectChecklistRow[]>();

    for (const topic of input.topics) {
      const list = topicsBySubjectId.get(topic.subjectId) ?? [];
      list.push(topic);
      topicsBySubjectId.set(topic.subjectId, list);
    }

    for (const item of input.checklist) {
      const subjectList = checklistBySubjectId.get(item.subjectId) ?? [];
      subjectList.push(item);
      checklistBySubjectId.set(item.subjectId, subjectList);
      if (item.topicId) {
        const topicList = checklistByTopicId.get(item.topicId) ?? [];
        topicList.push(item);
        checklistByTopicId.set(item.topicId, topicList);
      }
    }

    const subjectDetailsBySemester = new Map<string, SubjectDetailDto[]>();
    const seenSubjectIds = new Set<string>();
    for (const subject of input.subjects) {
      if (seenSubjectIds.has(subject.id)) continue;
      seenSubjectIds.add(subject.id);
      const semester = semestersById.get(subject.semesterId);
      if (!semester) continue;
      const obsCounts = input.obsCountMap.get(subject.id) ?? { open: 0, correctionSent: 0 };
      const subjectTopics = (topicsBySubjectId.get(subject.id) ?? []).sort((a, b) => a.order - b.order);
      const topicDetails: TopicDetailDto[] = subjectTopics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        order: topic.order,
        checklist: (checklistByTopicId.get(topic.id) ?? [])
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((item) => ({
            id: item.id,
            subjectId: item.subjectId,
            topicId: item.topicId,
            category: item.category,
            label: item.label,
            status: item.status,
            ownerRole: item.ownerRole,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
      }));

      const subjectChecklist: ChecklistItemDto[] = (checklistBySubjectId.get(subject.id) ?? [])
        .filter((item) => !item.topicId)
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((item) => ({
          id: item.id,
          subjectId: item.subjectId,
          topicId: item.topicId,
          category: item.category,
          label: item.label,
          status: item.status,
          ownerRole: item.ownerRole,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));

      const detail: SubjectDetailDto = {
        id: subject.id,
        name: subject.name,
        expectedDeliveryDate:
          subject.expectedDeliveryDate ??
          semester.factoryExpectedDate ??
          input.project.expectedDeliveryDate,
        status: subject.status,
        operationalState: deriveSubjectOperationalState({
          subjectStatus: subject.status,
          projectStatus: input.project.status,
          openObservationsCount: obsCounts.open,
          correctionSentCount: obsCounts.correctionSent,
        }),
        progress: subject.progress,
        factoryProductionStatus:
          (subject.factoryProductionStatus as FactoryProductionStatus | null) ??
          FactoryProductionStatus.NOT_STARTED,
        factoryProductionCompletedAt: subject.factoryProductionCompletedAt,
        createdFromChange: Boolean(subject.createdFromChange),
        topics: topicDetails,
        checklist: subjectChecklist,
        openObservationsCount: obsCounts.open,
        correctionSentCount: obsCounts.correctionSent,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      };

      const list = subjectDetailsBySemester.get(subject.semesterId) ?? [];
      list.push(detail);
      subjectDetailsBySemester.set(subject.semesterId, list);
    }

    const semesterDetails: SemesterDetailDto[] = input.semesters.map((semester) => ({
      id: semester.id,
      semesterNumber: semester.semesterNumber,
      status: semester.status,
      createdFromChange: Boolean(semester.createdFromChange),
      factoryExpectedDate: semester.factoryExpectedDate,
      continuationDate: semester.continuationDate,
      subjects: (subjectDetailsBySemester.get(semester.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      createdAt: semester.createdAt,
      updatedAt: semester.updatedAt,
    }));

    let semestersAdded = 0;
    let subjectsAdded = 0;
    for (const semester of input.semesters) {
      if (semester.createdFromChange) semestersAdded += 1;
    }
    for (const subject of input.subjects) {
      if (subject.createdFromChange) subjectsAdded += 1;
    }

    const detail: ProjectDetailDto = {
      id: input.project.id,
      school: input.project.school,
      program: input.project.program,
      modality: input.project.modality,
      requestType: input.project.requestType,
      priority: input.project.priority,
      status: input.project.status,
      progress: input.project.progress,
      expectedDeliveryDate: input.project.expectedDeliveryDate,
      activatedAt: input.project.activatedAt,
      subjectMatterExpertType: input.project.subjectMatterExpertType,
      subjectMatterExpertStatus: input.project.subjectMatterExpertStatus,
      expertConfirmedAt: input.project.expertConfirmedAt,
      productOwner: input.productOwner,
      factoryOwner: input.factoryOwner,
      createdAt: input.project.createdAt,
      observations: input.project.observations,
      updatedAt: input.project.updatedAt,
      semesters: semesterDetails,
      links: input.links.map((link) => ({
        id: link.id,
        title: link.title,
        url: link.url,
        type: link.type,
        uploadedBy: link.uploadedBy,
        createdAt: link.createdAt,
      })),
    };

    if (semestersAdded > 0 || subjectsAdded > 0) {
      detail.recentChanges = { semestersAdded, subjectsAdded };
    }
    if (input.timeline.length > 0) {
      detail.changeTimeline = input.timeline;
    }

    return detail;
  }

  private toOwner(user: UserEntity): ProjectOwnerDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  private toListItem(project: ProjectEntity): ProjectListItemDto {
    return {
      id: project.id,
      school: project.school,
      program: project.program,
      modality: project.modality,
      requestType: project.requestType,
      priority: project.priority,
      status: project.status,
      progress: project.progress,
      expectedDeliveryDate: project.expectedDeliveryDate,
      activatedAt: project.activatedAt,
      subjectMatterExpertType: project.subjectMatterExpertType,
      subjectMatterExpertStatus: project.subjectMatterExpertStatus,
      expertConfirmedAt: project.expertConfirmedAt,
      productOwner: this.toOwner(project.productOwner),
      factoryOwner: project.factoryOwner ? this.toOwner(project.factoryOwner) : null,
      createdAt: project.createdAt,
    };
  }

  /**
   * Activa la solicitud y calcula fechas de entrega (proyecto, semestres y materias).
   */
  async applyProjectActivation(
    projectId: string,
    manager: import('typeorm').EntityManager,
    plan: {
      activatedAt: Date;
      expectedDeliveryDate: Date;
      status: ProjectStatus;
      subjectMatterExpertStatus: SubjectMatterExpertStatus;
      expertConfirmedAt: Date;
    },
  ): Promise<Date> {
    const deliveryDate = plan.expectedDeliveryDate;
    const projectRepository = manager.getRepository(ProjectEntity);
    const semesterRepository = manager.getRepository(SemesterEntity);
    const subjectRepository = manager.getRepository(SubjectEntity);

    await projectRepository.update(
      { id: projectId },
      {
        activatedAt: plan.activatedAt,
        expertConfirmedAt: plan.expertConfirmedAt,
        expectedDeliveryDate: deliveryDate,
        status: plan.status,
        subjectMatterExpertStatus: plan.subjectMatterExpertStatus,
      },
    );

    const semesters = await semesterRepository.find({
      where: { projectId, deletedAt: IsNull() },
      select: { id: true },
    });

    if (semesters.length > 0) {
      const semesterIds = semesters.map((s) => s.id);
      await semesterRepository
        .createQueryBuilder()
        .update()
        .set({ factoryExpectedDate: deliveryDate })
        .where('id IN (:...semesterIds)', { semesterIds })
        .execute();

      await subjectRepository
        .createQueryBuilder()
        .update()
        .set({ expectedDeliveryDate: deliveryDate })
        .where('"semesterId" IN (:...semesterIds)', { semesterIds })
        .andWhere('"deletedAt" IS NULL')
        .execute();
    }

    return deliveryDate;
  }

  private toChecklistItem(item: ChecklistItemEntity): ChecklistItemDto {
    return {
      id: item.id,
      subjectId: item.subject?.id ?? (item as any).subjectId,
      topicId: item.topic?.id ?? null,
      category: item.category,
      label: item.label,
      status: item.status,
      ownerRole: item.ownerRole,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toChecklistItemWithContext(
    item: ChecklistItemEntity,
    subjectId: string,
    topicId: string | null,
  ): ChecklistItemDto {
    return {
      id: item.id,
      subjectId,
      topicId,
      category: item.category,
      label: item.label,
      status: item.status,
      ownerRole: item.ownerRole,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private dedupeChecklistItems(items: ChecklistItemEntity[]): ChecklistItemEntity[] {
    const seen = new Set<string>();
    const out: ChecklistItemEntity[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  private toDetail(
    project: ProjectEntity,
    obsCountMap = new Map<string, { open: number; correctionSent: number }>(),
  ): ProjectDetailDto {
    const semesters = [...(project.semesters ?? [])].sort(
      (a, b) => a.semesterNumber - b.semesterNumber,
    );

    const semesterDetails: SemesterDetailDto[] = semesters.map((semester) => {
      const subjects = [...(semester.subjects ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      const subjectDetails: SubjectDetailDto[] = subjects.map((subject) => {
        const obsCounts = obsCountMap.get(subject.id) ?? {
          open: 0,
          correctionSent: 0,
        };
        const topics = [...(subject.topics ?? [])].sort((a, b) => a.order - b.order);
        const subjectChecklist = this.dedupeChecklistItems(subject.checklist ?? [])
          .filter((item) => !item.topic?.id)
          .sort((a, b) => a.label.localeCompare(b.label));

        const topicDetails: TopicDetailDto[] = topics.map((topic) => {
          const topicChecklist = this.dedupeChecklistItems(topic.checklist ?? [])
            .sort((a, b) => a.label.localeCompare(b.label));
          return {
            id: topic.id,
            name: topic.name,
            order: topic.order,
            checklist: topicChecklist.map((item) => this.toChecklistItemWithContext(item, subject.id, topic.id)),
            createdAt: topic.createdAt,
            updatedAt: topic.updatedAt,
          };
        });

          return {
            id: subject.id,
            name: subject.name,
            expectedDeliveryDate:
              subject.expectedDeliveryDate ??
              semester.factoryExpectedDate ??
              project.expectedDeliveryDate,
            status: subject.status,
            operationalState: deriveSubjectOperationalState({
              subjectStatus: subject.status,
              projectStatus: project.status,
              openObservationsCount: obsCounts.open,
              correctionSentCount: obsCounts.correctionSent,
            }),
            progress: subject.progress,
            factoryProductionStatus: subject.factoryProductionStatus,
            factoryProductionCompletedAt: subject.factoryProductionCompletedAt,
            createdFromChange: Boolean(subject.createdFromChange),
            topics: topicDetails,
          checklist: subjectChecklist.map((item) => this.toChecklistItemWithContext(item, subject.id, null)),
          openObservationsCount: obsCounts.open,
          correctionSentCount: obsCounts.correctionSent,
          createdAt: subject.createdAt,
          updatedAt: subject.updatedAt,
        };
      });

      return {
        id: semester.id,
        semesterNumber: semester.semesterNumber,
        status: semester.status,
        createdFromChange: Boolean(semester.createdFromChange),
        factoryExpectedDate: semester.factoryExpectedDate,
        continuationDate: semester.continuationDate,
        subjects: subjectDetails,
        createdAt: semester.createdAt,
        updatedAt: semester.updatedAt,
      };
    });

    const links: ProjectLinkDto[] = [...(project.links ?? [])].map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      type: link.type,
      uploadedBy: link.uploadedBy,
      createdAt: link.createdAt,
    }));

    return {
      ...this.toListItem(project),
      observations: project.observations,
      updatedAt: project.updatedAt,
      semesters: semesterDetails,
      links,
    };
  }

  /**
   * Marca el proyecto como entregado (entrega final administrativa).
   * Persiste en `ProjectStatus.DELIVERED_TO_LMS` hasta migración de enum.
   */
  async markProjectDelivered(
    projectId: string,
    user: UserEntity,
  ): Promise<ProjectActionResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(ProjectEntity);
      const subjectRepo = manager.getRepository(SubjectEntity);

      const project = await projectRepo.findOne({
        where: { id: projectId, deletedAt: IsNull() },
        relations: { productOwner: true, factoryOwner: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      this.assertCanManageAsProductOwner(project, user);
      this.assertCanModifyProject(project, user);

      const subjects = await subjectRepo.find({
        where: { project: { id: projectId }, deletedAt: IsNull() },
      });
      if (subjects.length === 0) {
        throw new BadRequestException('Project has no active subjects');
      }
      if (!subjects.every((s) => s.status === SubjectStatus.APPROVED)) {
        throw new BadRequestException(
          'All subjects must be APPROVED before marking the project as delivered',
        );
      }

      if (await this.observationsService.hasBlockingObservationsForProject(projectId, manager)) {
        throw new BadRequestException('Project has blocking observations');
      }
      if (await this.projectWorkflowService.hasRejectedChecklistForProject(projectId, manager)) {
        throw new BadRequestException('Project has rejected checklist items');
      }

      const previousStatus = project.status;
      project.status = ProjectStatus.DELIVERED_TO_LMS;
      await projectRepo.save(project);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: previousStatus,
          toStatus: ProjectStatus.DELIVERED_TO_LMS,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.DELIVER,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: {
            status: ProjectStatus.DELIVERED_TO_LMS,
            label: 'Entrega final',
          },
        },
        manager,
      );

      if (project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          project.productOwner.id,
          {
            type: NotificationType.INFO,
            title: 'Proyecto entregado',
            message: 'El proyecto fue marcado como entregado.',
            entityType: 'PROJECT',
            entityId: projectId,
            eventType: NotificationEventType.PROJECT_DELIVERED,
            projectId,
            actionUrl: `/projects/${projectId}`,
          },
          manager,
        );
      }

      await this.notificationsService.notifyRole(
        UserRole.ADMIN,
        {
          type: NotificationType.INFO,
          title: 'Proyecto entregado',
          message: `El proyecto ${project.program} (${project.school}) fue marcado como entregado.`,
          entityType: 'PROJECT',
          entityId: projectId,
          eventType: NotificationEventType.PROJECT_DELIVERED,
          projectId,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );

      const progress = await this.progressService.calculateProjectProgress(projectId, manager);
      return {
        projectId,
        projectStatus: ProjectStatus.DELIVERED_TO_LMS,
        projectProgress: progress,
      };
    });
  }

  async closeProject(projectId: string, user: UserEntity): Promise<ProjectActionResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(ProjectEntity);

      const project = await projectRepo.findOne({
        where: { id: projectId, deletedAt: IsNull() },
        relations: { productOwner: true, factoryOwner: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      this.assertCanManageAsProductOwner(project, user);

      if (project.status !== ProjectStatus.DELIVERED_TO_LMS) {
        throw new BadRequestException(
          'Project must be marked as delivered before it can be closed',
        );
      }

      const previousStatus = project.status;
      project.status = ProjectStatus.CLOSED;
      await projectRepo.save(project);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: previousStatus,
          toStatus: ProjectStatus.CLOSED,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.CLOSE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: ProjectStatus.CLOSED },
        },
        manager,
      );

      if (project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          project.productOwner.id,
          {
            type: NotificationType.INFO,
            title: 'Proyecto cerrado',
            message: `El proyecto ${project.program} ha sido cerrado.`,
            entityType: 'PROJECT',
            entityId: projectId,
            eventType: NotificationEventType.PROJECT_CLOSED,
            projectId,
            actionUrl: `/projects/${projectId}`,
          },
          manager,
        );
      }

      const progress = await this.progressService.calculateProjectProgress(projectId, manager);
      return {
        projectId,
        projectStatus: ProjectStatus.CLOSED,
        projectProgress: progress,
      };
    });
  }

  async startProduction(projectId: string, user: UserEntity): Promise<ProjectActionResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(ProjectEntity);

      const project = await projectRepo.findOne({
        where: { id: projectId, deletedAt: IsNull() },
        relations: { productOwner: true, factoryOwner: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      if (project.status === ProjectStatus.CLOSED) {
        throw new ForbiddenException('Project is closed');
      }

      if (user.role === UserRole.FABRICA) {
        const assignedToMe = project.factoryOwner?.id === user.id;
        const unassigned = !project.factoryOwner;
        const isReady = project.status === ProjectStatus.READY_FOR_PRODUCTION;
        if (!(assignedToMe || unassigned || isReady)) {
          throw new ForbiddenException();
        }
      }

      if (project.status === ProjectStatus.IN_PRODUCTION) {
        return {
          projectId,
          projectStatus: project.status,
          projectProgress: project.progress,
        };
      }

      if (project.status !== ProjectStatus.READY_FOR_PRODUCTION) {
        throw new BadRequestException('Project cannot be started from current status');
      }

      const previousStatus = project.status;
      project.status = ProjectStatus.IN_PRODUCTION;
      await projectRepo.save(project);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: previousStatus,
          toStatus: ProjectStatus.IN_PRODUCTION,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.STATUS_CHANGE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: ProjectStatus.IN_PRODUCTION },
        },
        manager,
      );

      return {
        projectId,
        projectStatus: project.status,
        projectProgress: project.progress,
      };
    });
  }

  /**
   * TypeORM `insert()` no mapea FKs de relaciones (@JoinColumn); usar save o QueryBuilder.
   */
  private async bulkInsertChecklistItems(
    checklistRepository: Repository<ChecklistItemEntity>,
    rows: Array<{
      subjectId: string;
      topicId: string | null;
      label: string;
      status: ChecklistStatus;
      ownerRole: UserRole;
    }>,
  ): Promise<void> {
    if (!rows.length) return;
    const entities = rows.map((row) =>
      checklistRepository.create({
        subject: { id: row.subjectId },
        topic: row.topicId ? { id: row.topicId } : null,
        label: row.label,
        status: row.status,
        ownerRole: row.ownerRole,
      }),
    );
    await checklistRepository.save(entities, { chunk: 50 });
  }
}
