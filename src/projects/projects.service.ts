import {
  BadRequestException,
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
import { ProjectStatus } from '../common/enums/project-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
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
import { LinkResourceEntity } from './link-resource.entity';
import { MailService } from '../mail/mail.service';
import { AddSemesterDto } from '../semesters/dto/add-semester.dto';
import { ProjectEntity } from './project.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { loadProductObservationCountsBySubject } from '../observations/observation-subject-query.util';

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
      const isUnassigned = !project.factoryOwner;
      // Fabrica can always see their assigned projects. Additionally, unassigned projects
      // in the operational pipeline must be visible so they don't disappear after refresh.
      if (isAssigned || (isUnassigned && visibleStatuses.includes(project.status))) return;
      throw new ForbiddenException();
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
      return qb.andWhere(
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

    throw new ForbiddenException();
  }

  async findAll(user: UserEntity): Promise<ProjectListItemDto[]> {
    const projects = await this.buildProjectQueryByRole(user)
      .orderBy('project.createdAt', 'DESC')
      .getMany();

    const includeSubjectsSummary =
      user.role === UserRole.FABRICA ||
      user.role === UserRole.ADMIN ||
      user.role === UserRole.PRODUCT;
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
        projectId: string;
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
      const obsCounts = obsCountMap.get(row.id) ?? {
        open: 0,
        correctionSent: 0,
      };
      const summary: SubjectSummaryDto = {
        id: row.id,
        name: row.name,
        status: row.status,
        semesterNumber: row.semesterNumber,
        expectedDeliveryDate:
          row.expectedDeliveryDate ??
          row.semesterFactoryExpectedDate ??
          row.projectExpectedDeliveryDate,
        progress: row.progress,
        openObservationsCount: obsCounts.open,
        correctionSentCount: obsCounts.correctionSent,
        updatedAt: row.updatedAt,
      };
      const list = result.get(row.projectId) ?? [];
      list.push(summary);
      result.set(row.projectId, list);
    }

    return result;
  }

  async findOne(id: string, user: UserEntity): Promise<ProjectDetailDto> {
    const project = await this.projectRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: {
        productOwner: true,
        factoryOwner: true,
        links: true,
        semesters: {
          subjects: {
            topics: { checklist: true },
            checklist: { topic: true },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    this.assertCanViewProject(project, user);
    return this.toDetail(project);
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
          status: ProjectStatus.READY_FOR_PRODUCTION,
          progress: 0,
          expectedDeliveryDate: new Date(dto.expectedDeliveryDate),
           observations: dto.observations ?? null,
           productOwner: { id: productOwnerId },
           factoryOwner: resolvedFactoryOwnerId ? { id: resolvedFactoryOwnerId } : null,
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

      for (const semesterDto of dto.semesters) {
        const semester = await semesterRepository.save(
          semesterRepository.create({
            project: { id: project.id },
            semesterNumber: semesterDto.semesterNumber,
            factoryExpectedDate: new Date(semesterDto.factoryExpectedDate),
          }),
        );

        for (const subjectDto of semesterDto.subjects) {
            const subject = await subjectRepository.save(
              subjectRepository.create({
                project: { id: project.id },
                semester: { id: semester.id },
                name: subjectDto.name,
                expectedDeliveryDate: new Date(semesterDto.factoryExpectedDate),
                progress: 0,
              }),
            );

          for (const label of SUBJECT_CHECKLIST_LABELS) {
            await checklistRepository.save(
              checklistRepository.create({
                subject: { id: subject.id },
                topic: null,
                label,
                status: ChecklistStatus.PENDIENTE,
                ownerRole: UserRole.PRODUCT,
              }),
            );
          }

          for (let i = 0; i < subjectDto.topics.length; i++) {
            const topicName = subjectDto.topics[i];
            const topic = await topicRepository.save(
              topicRepository.create({
                subject: { id: subject.id },
                name: topicName,
                order: i + 1,
              }),
            );

            for (const label of TOPIC_CHECKLIST_LABELS) {
              await checklistRepository.save(
                checklistRepository.create({
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

    const detail = await this.findOne(projectId, user);
    void this.mailService.sendProductRequestCreatedEmail(detail);
    return detail;
  }

  async addSemesterToProject(projectId: string, dto: AddSemesterDto, user: UserEntity): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can modify semesters');
    }

    const changeSummary = {
      changeType: 'SEMESTER_ADDED',
      semesterNumber: dto.semesterNumber,
      subjectsAdded: dto.subjects.map((subject) => ({
        name: subject.name.trim(),
        topics: subject.topics.map((topic) => topic.trim()).filter(Boolean),
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

        for (let i = 0; i < subjectDto.topics.length; i++) {
          const topicName = subjectDto.topics[i].trim();
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
          title: 'Solicitud modificada',
          message: `Producto agregó el semestre ${dto.semesterNumber} a ${project.program}.`,
          entityType: 'PROJECT',
          entityId: project.id,
          eventType: NotificationEventType.PROJECT_MODIFIED,
          projectId: project.id,
          actionUrl: `/projects/${project.id}`,
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
        ...dto.subjects.map((subject) => `Asignatura: ${subject.name.trim()} (${subject.topics.map((topic) => topic.trim()).join(', ')})`),
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

  private validateSemesterNumbers(dto: CreateProjectDto): void {
    const numbers = dto.semesters.map((s) => s.semesterNumber);
    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      throw new BadRequestException('semesterNumber must be unique within the project');
    }
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
      productOwner: this.toOwner(project.productOwner),
      factoryOwner: project.factoryOwner ? this.toOwner(project.factoryOwner) : null,
      createdAt: project.createdAt,
    };
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

  private toDetail(project: ProjectEntity): ProjectDetailDto {
    const semesters = [...(project.semesters ?? [])].sort(
      (a, b) => a.semesterNumber - b.semesterNumber,
    );

    const semesterDetails: SemesterDetailDto[] = semesters.map((semester) => {
      const subjects = [...(semester.subjects ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      const subjectDetails: SubjectDetailDto[] = subjects.map((subject) => {
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
            progress: subject.progress,
            topics: topicDetails,
          checklist: subjectChecklist.map((item) => this.toChecklistItemWithContext(item, subject.id, null)),
          createdAt: subject.createdAt,
          updatedAt: subject.updatedAt,
        };
      });

      return {
        id: semester.id,
        semesterNumber: semester.semesterNumber,
        status: semester.status,
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
}
