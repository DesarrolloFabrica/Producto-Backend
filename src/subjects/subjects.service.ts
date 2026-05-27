import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { TOPIC_CHECKLIST_LABELS, SUBJECT_CHECKLIST_LABELS } from '../checklist/checklist.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ObservationsService } from '../observations/observations.service';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsService } from '../projects/projects.service';
import { MailService } from '../mail/mail.service';
import { Priority } from '../common/enums/priority.enum';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { SemesterEntity } from '../semesters/semester.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { SemesterWorkflowService } from '../workflow/semester-workflow.service';
import { SubjectWorkflowService } from '../workflow/subject-workflow.service';
import { ObservationEntity } from '../observations/observation.entity';
import { RejectSubjectDto } from './dto/reject-subject.dto';
import { RequestSubjectCorrectionDto } from './dto/request-subject-correction.dto';
import { AddSubjectDto } from './dto/add-subject.dto';
import { SubmitSubjectResponseDto } from './dto/submit-subject-response.dto';
import { SubjectEntity } from './subject.entity';
import { AddTopicsDto } from '../topics/dto/add-topics.dto';
import { assertSubjectTopicsCount } from '../common/utils/subject-topics.util';
import {
  ChecklistItemDto,
  ProjectDetailDto,
  ProjectOwnerDto,
  SubjectDetailDto,
  TopicDetailDto,
} from '../projects/dto/project-response.dto';
import { SubjectProductionStatusInput, UpdateProductionStatusDto } from './dto/update-production-status.dto';
import {
  SubjectWorkspaceDto,
  SubjectWorkspaceProjectMetaDto,
  SubjectWorkspaceSemesterMetaDto,
} from './dto/subject-workspace.dto';
import { deriveSubjectOperationalState } from '../factory/utils/operational-state.util';
import { InstitutionalWorkflowService } from '../institutional-workflow/institutional-workflow.service';
import { isInstitutionalWorkflowEnabled } from '../institutional-workflow/institutional-workflow.config';
import { isAcademicChecklistEditable } from '../institutional-workflow/institutional-workflow.transitions';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { OperationalTransitionDto } from '../institutional-workflow/dto/operational-transition.dto';

interface WorkspaceSubjectRow {
  id: string;
  projectId: string;
  semesterId: string;
  name: string;
  expectedDeliveryDate: Date | null;
  status: SubjectStatus;
  progress: number;
  createdFromChange: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceMetaRow {
  semesterId: string;
  semesterNumber: number;
  semesterStatus: SemesterEntity['status'];
  semesterCreatedFromChange: boolean;
  semesterFactoryExpectedDate: Date | null;
  semesterContinuationDate: Date | null;
  semesterCreatedAt: Date;
  semesterUpdatedAt: Date;
  projectId: string;
  school: string;
  program: string;
  modality: ProjectEntity['modality'];
  requestType: string;
  priority: ProjectEntity['priority'];
  projectStatus: ProjectStatus;
  projectProgress: number;
  projectExpectedDeliveryDate: Date | null;
  projectActivatedAt: Date | null;
  projectSubjectMatterExpertType: ProjectEntity['subjectMatterExpertType'];
  projectSubjectMatterExpertStatus: ProjectEntity['subjectMatterExpertStatus'];
  projectExpertConfirmedAt: Date | null;
  projectCreatedAt: Date;
  productOwnerId: string;
  factoryOwnerId: string | null;
  projectLegacyWorkflow: boolean;
}

interface WorkspaceOwnerRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface WorkspaceTopicRow {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceChecklistRow {
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

@Injectable()
export class SubjectsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    private readonly observationsService: ObservationsService,
    private readonly auditService: AuditService,
    private readonly statusHistoryService: StatusHistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly progressService: ProgressService,
    private readonly subjectWorkflowService: SubjectWorkflowService,
    private readonly semesterWorkflowService: SemesterWorkflowService,
    private readonly projectWorkflowService: ProjectWorkflowService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => InstitutionalWorkflowService))
    private readonly institutionalWorkflowService: InstitutionalWorkflowService,
  ) {}

  async submit(subjectId: string, user: UserEntity): Promise<SubmitSubjectResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only FABRICA or ADMIN can submit subjects');
    }

    return await this.dataSource.transaction(async (manager) => {
      const { subject, items } = await this.loadSubjectContext(subjectId, user, manager);
      if (this.institutionalWorkflowService.usesInstitutionalWorkflow(subject.project)) {
        throw new BadRequestException(
          'Use la transición operacional FACTORY_DELIVER_CONTENT en el panel de Fábrica',
        );
      }
      this.validateChecklistForSubmit(items);
      await this.assertNoBlockingObservations(subjectId, manager);

      return await this.applySubjectStatusChange(
        subject,
        SubjectStatus.IN_REVIEW,
        AuditAction.SUBMIT,
        user,
        manager,
        {
          notifyProductOnSubmit: true,
          forceProjectInReview: true,
        },
      );
    });
  }

  async approve(subjectId: string, user: UserEntity): Promise<SubmitSubjectResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    const { subject } = await this.loadSubjectContext(subjectId, user, this.dataSource.manager);
    this.projectsService.assertCanManageAsProductOwner(subject.project, user);

    if (
      subject.status === SubjectStatus.APPROVED ||
      subject.status === SubjectStatus.DELIVERED
    ) {
      throw new BadRequestException('La asignatura ya está aprobada.');
    }

    await this.assertReadyForAcademicApproval(subjectId, user, this.dataSource.manager);

    if (this.institutionalWorkflowService.usesInstitutionalWorkflow(subject.project)) {
      this.institutionalWorkflowService.assertAcademicPhaseAllowed(subject, subject.project);
      await this.dataSource.transaction(async (manager) => {
        await this.institutionalWorkflowService.applyTransitionInManager(
          manager,
          subjectId,
          { action: InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC },
          user,
        );
      });
      const refreshed = await this.loadSubjectContext(subjectId, user, this.dataSource.manager);
      return {
        subjectId: refreshed.subject.id,
        subjectStatus: refreshed.subject.status,
        subjectProgress: refreshed.subject.progress,
        semesterId: refreshed.subject.semester.id,
        semesterStatus: refreshed.subject.semester.status,
        projectId: refreshed.subject.project.id,
        projectStatus: refreshed.subject.project.status,
        projectProgress: refreshed.subject.project.progress,
      };
    }

    return await this.dataSource.transaction(async (manager) => {
      const ctx = await this.loadSubjectContext(subjectId, user, manager);
      const result = await this.applySubjectStatusChange(
        ctx.subject,
        SubjectStatus.APPROVED,
        AuditAction.APPROVE,
        user,
        manager,
        { notifyFactoryOnApprove: true },
      );
      return result;
    });
  }

  async reject(
    subjectId: string,
    dto: RejectSubjectDto,
    user: UserEntity,
  ): Promise<SubmitSubjectResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Debe indicar el motivo de la solicitud de correcciones');
    }
    if (reason.length < 10) {
      throw new BadRequestException('El motivo debe tener al menos 10 caracteres');
    }

    const { subject } = await this.loadSubjectContext(subjectId, user, this.dataSource.manager);
    this.projectsService.assertCanManageAsProductOwner(subject.project, user);

    if (
      subject.status === SubjectStatus.APPROVED ||
      subject.status === SubjectStatus.DELIVERED
    ) {
      throw new BadRequestException('No se pueden solicitar correcciones en una asignatura ya aprobada.');
    }

    if (this.institutionalWorkflowService.usesInstitutionalWorkflow(subject.project)) {
      this.institutionalWorkflowService.assertAcademicPhaseAllowed(subject, subject.project);
      await this.dataSource.transaction(async (manager) => {
        await this.institutionalWorkflowService.applyTransitionInManager(
          manager,
          subjectId,
          {
            action: InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES,
            comment: reason,
            returnReason: reason,
          },
          user,
        );
      });
      const refreshed = await this.loadSubjectContext(subjectId, user, this.dataSource.manager);
      return {
        subjectId: refreshed.subject.id,
        subjectStatus: refreshed.subject.status,
        subjectProgress: refreshed.subject.progress,
        semesterId: refreshed.subject.semester.id,
        semesterStatus: refreshed.subject.semester.status,
        projectId: refreshed.subject.project.id,
        projectStatus: refreshed.subject.project.status,
        projectProgress: refreshed.subject.project.progress,
      };
    }

    return await this.dataSource.transaction(async (manager) => {
      const { subject: managedSubject } = await this.loadSubjectContext(subjectId, user, manager);

      const previousSubjectStatus = managedSubject.status;
      managedSubject.status = SubjectStatus.CHANGES_REQUESTED;
      await manager.getRepository(SubjectEntity).save(managedSubject);

      const observationRepo = manager.getRepository(ObservationEntity);
      const observation = await observationRepo.save(
        observationRepo.create({
          project: { id: managedSubject.project.id },
          subject: { id: managedSubject.id },
          topic: null,
          checklistItem: null,
          author: { id: user.id },
          role: user.role,
          text: reason,
          status: ObservationStatus.ABIERTA,
          relatedEntityType: RelatedEntityType.SUBJECT,
          relatedEntityId: managedSubject.id,
          priority: Priority.HIGH,
          dueDate: null,
        }),
      );

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
          fromStatus: previousSubjectStatus,
          toStatus: SubjectStatus.CHANGES_REQUESTED,
          changedById: user.id,
        },
        manager,
      );

      const projectRepo = manager.getRepository(ProjectEntity);
      const previousProjectStatus = managedSubject.project.status;
      managedSubject.project.status = ProjectStatus.FEEDBACK_PENDING;
      await projectRepo.save(managedSubject.project);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: managedSubject.project.id,
          fromStatus: previousProjectStatus,
          toStatus: ProjectStatus.FEEDBACK_PENDING,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
          action: AuditAction.REJECT,
          userId: user.id,
          beforeJson: { status: previousSubjectStatus },
          afterJson: {
            status: SubjectStatus.CHANGES_REQUESTED,
            reason,
            observationId: observation.id,
          },
        },
        manager,
      );

      await this.notificationsService.notifyFactoryOwner(
        managedSubject.project.factoryOwner?.id,
        {
          type: NotificationType.CRITICAL,
          title: 'Asignatura rechazada',
          message: `La asignatura "${managedSubject.name}" fue rechazada: ${reason}`,
          entityType: 'OBSERVATION',
          entityId: observation.id,
          eventType: NotificationEventType.SUBJECT_REJECTED,
          projectId: managedSubject.project.id,
          subjectId: managedSubject.id,
          actionUrl: `/subjects/${managedSubject.id}?focus=correction`,
          severity: 'critical',
        },
        manager,
      );

      const semesterStatus = await this.semesterWorkflowService.updateSemesterStatus(
        managedSubject.semester.id,
        user.id,
        manager,
        managedSubject.semester.status,
      );
      const projectStatus = await this.projectWorkflowService.updateProjectStatus(
        managedSubject.project.id,
        user.id,
        manager,
        managedSubject.project.status,
      );
      const projectProgress = await this.progressService.calculateProjectProgress(
        managedSubject.project.id,
        manager,
      );
      const refreshedSubject = await manager.getRepository(SubjectEntity).findOne({
        where: { id: subjectId },
      });

      return {
        subjectId,
        subjectStatus: refreshedSubject!.status,
        subjectProgress: refreshedSubject!.progress,
        semesterId: managedSubject.semester.id,
        semesterStatus,
        projectId: managedSubject.project.id,
        projectStatus,
        projectProgress,
      };
    });
  }

  async requestCorrection(
    subjectId: string,
    dto: RequestSubjectCorrectionDto,
    user: UserEntity,
  ): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    const projectId = await this.dataSource.transaction(async (manager) => {
      const subjectRepo = manager.getRepository(SubjectEntity);
      const projectRepo = manager.getRepository(ProjectEntity);
      const observationRepo = manager.getRepository(ObservationEntity);

      const subject = await subjectRepo.findOne({
        where: { id: subjectId, deletedAt: IsNull() },
        relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
      });
      if (!subject) {
        throw new NotFoundException('Subject not found');
      }

      this.projectsService.assertCanManageAsProductOwner(subject.project, user);
      this.projectsService.assertCanModifyProject(subject.project, user);

      const reason = dto.reason.trim();
      if (
        subject.status === SubjectStatus.APPROVED ||
        subject.status === SubjectStatus.DELIVERED
      ) {
        throw new BadRequestException('Approved subjects cannot receive new correction requests.');
      }
      const observation = await observationRepo.save(
        observationRepo.create({
          project: { id: subject.project.id },
          subject: { id: subject.id },
          topic: null,
          checklistItem: null,
          author: { id: user.id },
          role: user.role,
          text: reason,
          status: ObservationStatus.ABIERTA,
          relatedEntityType: RelatedEntityType.SUBJECT,
          relatedEntityId: subject.id,
          priority: Priority.HIGH,
          dueDate: null,
        }),
      );

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          action: AuditAction.OBSERVATION_CREATE,
          userId: user.id,
          afterJson: {
            id: observation.id,
            projectId: subject.project.id,
            subjectId: subject.id,
            status: observation.status,
            relatedEntityType: observation.relatedEntityType,
            relatedEntityId: observation.relatedEntityId,
            reason,
          },
        },
        manager,
      );

      const previousSubjectStatus = subject.status;
      if (subject.status !== SubjectStatus.CHANGES_REQUESTED) {
        subject.status = SubjectStatus.CHANGES_REQUESTED;
        await subjectRepo.save(subject);
        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'SUBJECT',
            entityId: subject.id,
            fromStatus: previousSubjectStatus,
            toStatus: SubjectStatus.CHANGES_REQUESTED,
            changedById: user.id,
          },
          manager,
        );
      }

      const previousProjectStatus = subject.project.status;
      if (previousProjectStatus !== ProjectStatus.FEEDBACK_PENDING) {
        subject.project.status = ProjectStatus.FEEDBACK_PENDING;
        await projectRepo.save(subject.project);
        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'PROJECT',
            entityId: subject.project.id,
            fromStatus: previousProjectStatus,
            toStatus: ProjectStatus.FEEDBACK_PENDING,
            changedById: user.id,
          },
          manager,
        );
      }

      await this.auditService.createLog(
        {
          entityType: 'SUBJECT',
          entityId: subject.id,
          action: AuditAction.REJECT,
          userId: user.id,
          beforeJson: { status: previousSubjectStatus },
          afterJson: {
            status: SubjectStatus.CHANGES_REQUESTED,
            reason,
            observationId: observation.id,
          },
        },
        manager,
      );

      await this.notificationsService.notifyFactoryOwner(
        subject.project.factoryOwner?.id,
        {
          type: NotificationType.CRITICAL,
          title: 'Corrección solicitada por Product',
          message: `Product solicitó corrección en "${subject.name}": ${reason}`,
          entityType: 'OBSERVATION',
          entityId: observation.id,
          eventType: NotificationEventType.SUBJECT_CHANGES_REQUESTED,
          projectId: subject.project.id,
          subjectId: subject.id,
          actionUrl: `/subjects/${subject.id}?focus=correction`,
          severity: 'critical',
        },
        manager,
      );

      await this.semesterWorkflowService.updateSemesterStatus(subject.semester.id, user.id, manager);
      await this.projectWorkflowService.updateProjectStatus(subject.project.id, user.id, manager);
      await this.progressService.calculateProjectProgress(subject.project.id, manager);
      return subject.project.id;
    });

    return await this.projectsService.findOne(projectId, user);
  }

  async updateProductionStatus(
    subjectId: string,
    dto: UpdateProductionStatusDto,
    user: UserEntity,
  ): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    let postInstitutionalAction: InstitutionalOperationalAction | null = null;

    const projectId = await this.dataSource.transaction(async (manager) => {
      const subjectRepo = manager.getRepository(SubjectEntity);
      const checklistRepo = manager.getRepository(ChecklistItemEntity);

      const subject = await subjectRepo.findOne({
        where: { id: subjectId, deletedAt: IsNull() },
        relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
      });
      if (!subject) {
        throw new NotFoundException('Subject not found');
      }

      this.projectsService.assertCanModifyProject(subject.project, user);
      const usesInstitutional = this.institutionalWorkflowService.usesInstitutionalWorkflow(
        subject.project,
      );

      const factoryItems = await checklistRepo.find({
        where: { subject: { id: subject.id }, ownerRole: UserRole.FABRICA },
      });

      const previousSubjectStatus = subject.status;

      if (dto.status === SubjectProductionStatusInput.EN_PRODUCCION) {
        if (![SubjectStatus.PENDING, SubjectStatus.CHANGES_REQUESTED].includes(subject.status)) {
          throw new BadRequestException('Subject cannot start production from current status');
        }
        for (const item of factoryItems) {
          if (item.status !== ChecklistStatus.APROBADO) {
            item.status = ChecklistStatus.EN_PRODUCCION;
            item.updatedBy = { id: user.id } as UserEntity;
          }
        }
        await checklistRepo.save(factoryItems);
        subject.status = SubjectStatus.IN_PRODUCTION;
        await subjectRepo.save(subject);

        if (usesInstitutional) {
          postInstitutionalAction = null;
        } else if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Producción iniciada',
              message: `Fábrica inició la producción de la asignatura "${subject.name}".`,
              entityType: 'SUBJECT',
              entityId: subject.id,
              eventType: NotificationEventType.SUBJECT_PRODUCTION_STARTED,
              projectId: subject.project.id,
              subjectId: subject.id,
              actionUrl: `/subjects/${subject.id}`,
            },
            manager,
          );
        }
      }

      if (dto.status === SubjectProductionStatusInput.PENDIENTE) {
        throw new BadRequestException('Returning a subject to PENDIENTE is not supported from the UI flow');
      }

      if (dto.status === SubjectProductionStatusInput.COMPLETADA) {
        if (![SubjectStatus.IN_PRODUCTION, SubjectStatus.CHANGES_REQUESTED, SubjectStatus.PENDING].includes(subject.status)) {
          throw new BadRequestException('Subject cannot be completed from current status');
        }
        if (await this.observationsService.hasBlockingObservationsForSubject(subject.id, manager)) {
          throw new BadRequestException('Aún existen correcciones pendientes por aplicar.');
        }
        for (const item of factoryItems) {
          if (item.status !== ChecklistStatus.APROBADO) {
            item.status = ChecklistStatus.ENTREGADO;
            item.updatedBy = { id: user.id } as UserEntity;
          }
        }
        await checklistRepo.save(factoryItems);

        await this.progressService.calculateSubjectProgress(subject.id, manager);

        if (usesInstitutional) {
          postInstitutionalAction = null;
        } else {
          await this.applySubjectStatusChange(
            subject,
            SubjectStatus.IN_REVIEW,
            AuditAction.SUBMIT,
            user,
            manager,
            {
              notifyProductOnSubmit: true,
              forceProjectInReview: true,
            },
          );
        }
      } else {
        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'SUBJECT',
            entityId: subject.id,
            fromStatus: previousSubjectStatus,
            toStatus: subject.status,
            changedById: user.id,
          },
          manager,
        );

        await this.auditService.createLog(
          {
            entityType: 'SUBJECT',
            entityId: subject.id,
            action: AuditAction.STATUS_CHANGE,
            userId: user.id,
            beforeJson: { status: previousSubjectStatus },
            afterJson: { status: subject.status, productionStatus: dto.status },
          },
          manager,
        );

        await this.semesterWorkflowService.updateSemesterStatus(subject.semester.id, user.id, manager);
        await this.projectWorkflowService.updateProjectStatus(subject.project.id, user.id, manager);
        await this.progressService.calculateProjectProgress(subject.project.id, manager);
      }

      if (postInstitutionalAction) {
        await this.institutionalWorkflowService.applyTransitionInManager(
          manager,
          subjectId,
          { action: postInstitutionalAction },
          user,
        );
      }

      return subject.project.id;
    });

    return await this.projectsService.findOne(projectId, user);
  }

  async addSubjectToSemester(
    _semesterId: string,
    _dto: AddSubjectDto,
    user: UserEntity,
  ): Promise<ProjectDetailDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can modify semesters');
    }

    throw new BadRequestException(
      'No se pueden agregar asignaturas a un semestre ya creado. Cree un nuevo semestre desde el detalle del proyecto.',
    );
  }

  async getDetailById(subjectId: string, user: UserEntity): Promise<ProjectDetailDto> {
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true } },
    });

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    this.projectsService.assertCanViewProject(subject.project, user);
    return await this.projectsService.findOne(subject.project.id, user);
  }

  async getWorkspace(subjectId: string, user: UserEntity): Promise<SubjectWorkspaceDto> {
    const subjectRows = await this.dataSource.query<WorkspaceSubjectRow[]>(
      `
        SELECT
          s.id,
          s."projectId",
          s."semesterId",
          s.name,
          s."expectedDeliveryDate",
          s.status,
          s.progress,
          s."created_from_change" AS "createdFromChange",
          s."createdAt",
          s."updatedAt"
        FROM subjects s
        WHERE s.id = $1
          AND s."deletedAt" IS NULL
        LIMIT 1
      `,
      [subjectId],
    );
    const subject = subjectRows[0];

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    const metaRows = await this.dataSource.query<WorkspaceMetaRow[]>(
      `
        SELECT
          sem.id AS "semesterId",
          sem."semesterNumber",
          sem.status AS "semesterStatus",
          sem."created_from_change" AS "semesterCreatedFromChange",
          sem."factoryExpectedDate" AS "semesterFactoryExpectedDate",
          sem."continuationDate" AS "semesterContinuationDate",
          sem."createdAt" AS "semesterCreatedAt",
          sem."updatedAt" AS "semesterUpdatedAt",
          p.id AS "projectId",
          p.school,
          p.program,
          p.modality,
          p."requestType",
          p.priority,
          p.status AS "projectStatus",
          p.progress AS "projectProgress",
          p."expectedDeliveryDate" AS "projectExpectedDeliveryDate",
          p."activatedAt" AS "projectActivatedAt",
          p."subjectMatterExpertType" AS "projectSubjectMatterExpertType",
          p."subjectMatterExpertStatus" AS "projectSubjectMatterExpertStatus",
          p."expertConfirmedAt" AS "projectExpertConfirmedAt",
          p."createdAt" AS "projectCreatedAt",
          p."productOwnerId",
          p."factoryOwnerId",
          p.legacy_workflow AS "projectLegacyWorkflow"
        FROM semesters sem
        INNER JOIN projects p ON p.id = sem."projectId"
        WHERE sem.id = $1
          AND sem."deletedAt" IS NULL
          AND p.id = $2
          AND p."deletedAt" IS NULL
        LIMIT 1
      `,
      [subject.semesterId, subject.projectId],
    );
    const meta = metaRows[0];

    if (!meta) {
      throw new NotFoundException('Project or semester not found');
    }

    const ownerIds = [meta.productOwnerId, meta.factoryOwnerId].filter(Boolean);
    const ownerRows = await this.dataSource.query<WorkspaceOwnerRow[]>(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = ANY($1::uuid[])
      `,
      [ownerIds],
    );
    const ownersById = new Map(ownerRows.map((owner) => [owner.id, owner]));
    const productOwner = ownersById.get(meta.productOwnerId);
    const factoryOwner = meta.factoryOwnerId ? ownersById.get(meta.factoryOwnerId) ?? null : null;

    if (!productOwner) {
      throw new NotFoundException('Project owner not found');
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isProductOwner = user.role === UserRole.PRODUCT && meta.productOwnerId === user.id;
    const isFactoryOwner = user.role === UserRole.FABRICA && meta.factoryOwnerId === user.id;

    const visibleFactoryStatuses: ProjectStatus[] = [
      ProjectStatus.READY_FOR_PRODUCTION,
      ProjectStatus.IN_PRODUCTION,
      ProjectStatus.FEEDBACK_PENDING,
      ProjectStatus.IN_REVIEW,
    ];
    const isVisibleUnassignedFactoryProject =
      user.role === UserRole.FABRICA &&
      !meta.factoryOwnerId &&
      visibleFactoryStatuses.includes(meta.projectStatus);

    const isInstitutionalReader =
      (user.role === UserRole.PLANEACION || user.role === UserRole.LMS) &&
      !meta.projectLegacyWorkflow;

    if (
      !isAdmin &&
      !isProductOwner &&
      !isFactoryOwner &&
      !isVisibleUnassignedFactoryProject &&
      !isInstitutionalReader
    ) {
      throw new ForbiddenException();
    }

    const [topics, checklist] = await Promise.all([
      this.dataSource.query<WorkspaceTopicRow[]>(
        `
          SELECT id, name, "order", "createdAt", "updatedAt"
          FROM topics
          WHERE "subjectId" = $1
            AND "deletedAt" IS NULL
          ORDER BY "order" ASC
        `,
        [subject.id],
      ),
      this.dataSource.query<WorkspaceChecklistRow[]>(
        `
          SELECT id, "subjectId", "topicId", category, label, status, "ownerRole", "createdAt", "updatedAt"
          FROM checklist_items
          WHERE "subjectId" = $1
          ORDER BY "topicId" ASC NULLS FIRST, label ASC
        `,
        [subject.id],
      ),
    ]);

    const observations = await this.observationsService.findBySubjectForProject(subjectId, meta.projectId);

    const openObservationsCount = observations.filter(
      (observation) =>
        observation.role === UserRole.PRODUCT &&
        observation.status === ObservationStatus.ABIERTA &&
        observation.notificationStatus === ObservationNotificationStatus.SENT,
    ).length;
    const correctionSentCount = observations.filter(
      (observation) => observation.role === UserRole.PRODUCT && observation.status === ObservationStatus.EN_CORRECCION,
    ).length;
    return {
      projectMeta: this.toWorkspaceProjectMetaFromRows(meta, productOwner, factoryOwner),
      semesterMeta: this.toWorkspaceSemesterMetaFromRow(meta),
      subject: this.toWorkspaceSubjectDetailFromRows(
        subject,
        meta,
        topics,
        checklist,
        openObservationsCount,
        correctionSentCount,
      ),
      observations,
    };
  }

  private toWorkspaceProjectMetaFromRows(
    meta: WorkspaceMetaRow,
    productOwner: WorkspaceOwnerRow,
    factoryOwner: WorkspaceOwnerRow | null,
  ): SubjectWorkspaceProjectMetaDto {
    return {
      id: meta.projectId,
      school: meta.school,
      program: meta.program,
      modality: meta.modality,
      requestType: meta.requestType,
      priority: meta.priority,
      status: meta.projectStatus,
      progress: meta.projectProgress,
      expectedDeliveryDate: meta.projectExpectedDeliveryDate,
      activatedAt: meta.projectActivatedAt,
      subjectMatterExpertType: meta.projectSubjectMatterExpertType,
      subjectMatterExpertStatus: meta.projectSubjectMatterExpertStatus,
      expertConfirmedAt: meta.projectExpertConfirmedAt,
      productOwner,
      factoryOwner,
      createdAt: meta.projectCreatedAt,
    };
  }

  private toWorkspaceSemesterMetaFromRow(meta: WorkspaceMetaRow): SubjectWorkspaceSemesterMetaDto {
    return {
      id: meta.semesterId,
      semesterNumber: meta.semesterNumber,
      status: meta.semesterStatus,
      createdFromChange: Boolean(meta.semesterCreatedFromChange),
      factoryExpectedDate: meta.semesterFactoryExpectedDate,
      continuationDate: meta.semesterContinuationDate,
      createdAt: meta.semesterCreatedAt,
      updatedAt: meta.semesterUpdatedAt,
    };
  }

  private toWorkspaceChecklistItemFromRow(item: WorkspaceChecklistRow): ChecklistItemDto {
    return {
      id: item.id,
      subjectId: item.subjectId,
      topicId: item.topicId,
      category: item.category,
      label: item.label,
      status: item.status,
      ownerRole: item.ownerRole,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toWorkspaceSubjectDetailFromRows(
    subject: WorkspaceSubjectRow,
    meta: WorkspaceMetaRow,
    topics: WorkspaceTopicRow[],
    checklist: WorkspaceChecklistRow[],
    openObservationsCount: number,
    correctionSentCount: number,
  ): SubjectDetailDto {
    const topicDetails: TopicDetailDto[] = topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      order: topic.order,
      checklist: checklist
        .filter((item) => item.topicId === topic.id)
        .map((item) => this.toWorkspaceChecklistItemFromRow(item)),
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    }));

    return {
      id: subject.id,
      name: subject.name,
      expectedDeliveryDate:
        subject.expectedDeliveryDate ??
        meta.semesterFactoryExpectedDate ??
        meta.projectExpectedDeliveryDate,
      status: subject.status,
      operationalState: deriveSubjectOperationalState({
        subjectStatus: subject.status,
        projectStatus: meta.projectStatus,
        openObservationsCount,
        correctionSentCount,
      }),
      progress: subject.progress,
      createdFromChange: Boolean(subject.createdFromChange),
      topics: topicDetails,
      checklist: checklist
        .filter((item) => !item.topicId)
        .map((item) => this.toWorkspaceChecklistItemFromRow(item)),
      openObservationsCount,
      correctionSentCount,
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    };
  }

  private toWorkspaceOwner(user: UserEntity): ProjectOwnerDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  private toWorkspaceProjectMeta(project: ProjectEntity): SubjectWorkspaceProjectMetaDto {
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
      productOwner: this.toWorkspaceOwner(project.productOwner),
      factoryOwner: project.factoryOwner ? this.toWorkspaceOwner(project.factoryOwner) : null,
      createdAt: project.createdAt,
    };
  }

  private toWorkspaceSemesterMeta(semester: SemesterEntity): SubjectWorkspaceSemesterMetaDto {
    return {
      id: semester.id,
      semesterNumber: semester.semesterNumber,
      status: semester.status,
      createdFromChange: Boolean(semester.createdFromChange),
      factoryExpectedDate: semester.factoryExpectedDate,
      continuationDate: semester.continuationDate,
      createdAt: semester.createdAt,
      updatedAt: semester.updatedAt,
    };
  }

  private toWorkspaceChecklistItem(
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

  private dedupeWorkspaceChecklistItems(items: ChecklistItemEntity[]): ChecklistItemEntity[] {
    const seen = new Set<string>();
    const out: ChecklistItemEntity[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  private toWorkspaceSubjectDetail(
    subject: SubjectEntity,
    openObservationsCount: number,
    correctionSentCount: number,
  ): SubjectDetailDto {
    const topics = [...(subject.topics ?? [])]
      .filter((topic) => !topic.deletedAt)
      .sort((a, b) => a.order - b.order);
    const subjectChecklist = this.dedupeWorkspaceChecklistItems(subject.checklist ?? [])
      .filter((item) => !item.topic?.id)
      .sort((a, b) => a.label.localeCompare(b.label));
    const topicDetails: TopicDetailDto[] = topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      order: topic.order,
      checklist: this.dedupeWorkspaceChecklistItems(topic.checklist ?? [])
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((item) => this.toWorkspaceChecklistItem(item, subject.id, topic.id)),
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    }));

    return {
      id: subject.id,
      name: subject.name,
      expectedDeliveryDate:
        subject.expectedDeliveryDate ??
        subject.semester.factoryExpectedDate ??
        subject.project.expectedDeliveryDate,
      status: subject.status,
      operationalState: deriveSubjectOperationalState({
        subjectStatus: subject.status,
        projectStatus: subject.project.status,
        openObservationsCount,
        correctionSentCount,
      }),
      progress: subject.progress,
      createdFromChange: Boolean(subject.createdFromChange),
      topics: topicDetails,
      checklist: subjectChecklist.map((item) => this.toWorkspaceChecklistItem(item, subject.id, null)),
      openObservationsCount,
      correctionSentCount,
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    };
  }

  async addTopicsToSubject(
    subjectId: string,
    dto: AddTopicsDto,
    user: UserEntity,
  ): Promise<SubjectWorkspaceDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can modify subjects');
    }

    const topicNames = dto.topics.map((topic) => topic.trim()).filter(Boolean);
    assertSubjectTopicsCount(topicNames.length);

    await this.dataSource.transaction(async (manager) => {
      const subjectRepo = manager.getRepository(SubjectEntity);
      const topicRepo = manager.getRepository(TopicEntity);
      const checklistRepo = manager.getRepository(ChecklistItemEntity);

      const subject = await subjectRepo.findOne({
        where: { id: subjectId, deletedAt: IsNull() },
        relations: { project: { productOwner: true, factoryOwner: true } },
      });
      if (!subject) {
        throw new NotFoundException('Subject not found');
      }

      this.projectsService.assertCanModifyProject(subject.project, user);
      this.projectsService.assertCanManageAsProductOwner(subject.project, user);
      this.assertAcademicTopicsEditable(subject);

      const existingCount = await topicRepo.count({
        where: { subjectId, deletedAt: IsNull() },
      });
      if (existingCount > 0) {
        throw new BadRequestException(
          'Los gránulos ya fueron definidos. Use la edición de nombres si necesita ajustarlos.',
        );
      }

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

      await this.auditService.createLog(
        {
          entityType: 'SUBJECT',
          entityId: subject.id,
          action: AuditAction.UPDATE,
          userId: user.id,
          afterJson: {
            topicsDefined: topicNames.length,
            topicNames,
            changeReason: dto.changeReason?.trim() ?? null,
          },
        },
        manager,
      );
    });

    return await this.getWorkspace(subjectId, user);
  }

  async updateTopicName(
    topicId: string,
    name: string,
    user: UserEntity,
  ): Promise<SubjectWorkspaceDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only PRODUCT or ADMIN can modify topics');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('El nombre del gránulo es requerido.');
    }

    const topic = await this.dataSource.getRepository(TopicEntity).findOne({
      where: { id: topicId, deletedAt: IsNull() },
      relations: { subject: { project: { productOwner: true, factoryOwner: true } } },
    });
    if (!topic?.subject) {
      throw new NotFoundException('Topic not found');
    }

    this.projectsService.assertCanModifyProject(topic.subject.project, user);
    this.projectsService.assertCanManageAsProductOwner(topic.subject.project, user);
    this.assertAcademicTopicsEditable(topic.subject);

    const previousName = topic.name;
    topic.name = trimmed;
    await this.dataSource.getRepository(TopicEntity).save(topic);

    await this.auditService.createLog({
      entityType: 'TOPIC',
      entityId: topic.id,
      action: AuditAction.UPDATE,
      userId: user.id,
      beforeJson: { name: previousName },
      afterJson: { name: trimmed },
    });

    return await this.getWorkspace(topic.subjectId, user);
  }

  private assertAcademicTopicsEditable(subject: SubjectEntity): void {
    if (!isInstitutionalWorkflowEnabled() || subject.project.legacyWorkflow) {
      if (subject.status !== SubjectStatus.IN_REVIEW) {
        throw new BadRequestException(
          'Los gránulos solo se pueden editar durante la revisión académica de la asignatura.',
        );
      }
      return;
    }

    if (!isAcademicChecklistEditable(subject.operationalState)) {
      throw new BadRequestException(
        'Los gránulos solo se pueden definir o editar durante la revisión académica (IN_PRODUCT_ACADEMIC_REVIEW).',
      );
    }
  }

  private async assertSubjectHasRequiredTopics(
    subjectId: string,
    manager: EntityManager,
  ): Promise<void> {
    const topicRepo = manager.getRepository(TopicEntity);
    const count = await topicRepo.count({
      where: { subjectId, deletedAt: IsNull() },
    });
    assertSubjectTopicsCount(count);
  }

  private async loadSubjectContext(
    subjectId: string,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<{ subject: SubjectEntity; items: ChecklistItemEntity[] }> {
    const subjectRepo = manager.getRepository(SubjectEntity);
    const checklistRepo = manager.getRepository(ChecklistItemEntity);

    const subject = await subjectRepo.findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: {
        project: { productOwner: true, factoryOwner: true },
        semester: true,
      },
    });

    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    this.projectsService.assertCanModifyProject(subject.project, user);

    const items = await checklistRepo.find({
      where: { subject: { id: subjectId } },
    });

    return { subject, items };
  }

  private validateChecklistForSubmit(items: ChecklistItemEntity[]): void {
    const factoryItems = items.filter((item) => item.ownerRole === UserRole.FABRICA);
    if (factoryItems.length === 0) {
      return;
    }
    if (factoryItems.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      throw new BadRequestException('Cannot submit subject with rejected checklist items');
    }
    const allDeliveredOrApproved = factoryItems.every((item) =>
      [ChecklistStatus.ENTREGADO, ChecklistStatus.APROBADO].includes(item.status),
    );
    if (!allDeliveredOrApproved) {
      throw new BadRequestException(
        'All factory checklist items must be ENTREGADO or APROBADO before submit',
      );
    }
  }

  /**
   * Valida que Product pueda cerrar la revisión académica:
   * - gránulos definidos (4–6)
   * - todos los entregables PRODUCT aprobados
   * - todos los ítems de temas/gránulos (FABRICA) aprobados por Product
   * - sin observaciones bloqueantes ni pendientes de validación
   */
  async assertReadyForAcademicApproval(
    subjectId: string,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.dataSource.manager;
    const { items } = await this.loadSubjectContext(subjectId, user, em);
    await this.assertSubjectHasRequiredTopics(subjectId, em);
    this.validateChecklistForApprove(items);
    await this.assertNoBlockingObservations(subjectId, em);
    await this.assertNoUnresolvedObservations(subjectId, em);
  }

  async getAcademicApprovalBlockers(
    subjectId: string,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<string[]> {
    try {
      await this.assertReadyForAcademicApproval(subjectId, user, manager);
      return [];
    } catch (error) {
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        if (typeof response === 'string') return [response];
        if (typeof response === 'object' && response && 'message' in response) {
          const message = (response as { message: string | string[] }).message;
          return Array.isArray(message) ? message : [message];
        }
      }
      throw error;
    }
  }

  private validateChecklistForApprove(items: ChecklistItemEntity[]): void {
    const productItems = items.filter((item) => item.ownerRole === UserRole.PRODUCT);
    const factoryItems = items.filter((item) => item.ownerRole === UserRole.FABRICA);

    if (productItems.length === 0 && factoryItems.length === 0) {
      throw new BadRequestException('La asignatura no tiene entregables configurados en el checklist');
    }

    if (items.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      throw new BadRequestException('No puede aprobar académicamente mientras existan entregables rechazados');
    }

    const pendingProduct = productItems.filter((item) => item.status !== ChecklistStatus.APROBADO);
    if (pendingProduct.length > 0) {
      throw new BadRequestException(
        `Debe aprobar todos los entregables de Product (${pendingProduct.length} pendiente(s)) antes de la aprobación académica`,
      );
    }

    const pendingFactory = factoryItems.filter((item) => item.status !== ChecklistStatus.APROBADO);
    if (pendingFactory.length > 0) {
      const notDelivered = pendingFactory.filter(
        (item) =>
          item.status === ChecklistStatus.PENDIENTE ||
          item.status === ChecklistStatus.EN_PRODUCCION,
      );
      if (notDelivered.length > 0) {
        throw new BadRequestException(
          'Fábrica aún no ha entregado todos los materiales de temas/gránulos',
        );
      }
      throw new BadRequestException(
        `Debe aprobar todos los ítems de temas/gránulos (${pendingFactory.length} pendiente(s)) antes de la aprobación académica`,
      );
    }
  }

  private async assertNoBlockingObservations(
    subjectId: string,
    manager: EntityManager,
  ): Promise<void> {
    if (await this.observationsService.hasBlockingObservationsForSubject(subjectId, manager)) {
      throw new BadRequestException('Aún existen correcciones pendientes por aplicar.');
    }
  }

  private async assertNoUnresolvedObservations(
    subjectId: string,
    manager: EntityManager,
  ): Promise<void> {
    if (await this.observationsService.hasUnresolvedObservationsForSubject(subjectId, manager)) {
      throw new BadRequestException('Aún existen observaciones pendientes de validación.');
    }
  }

  private async applySubjectStatusChange(
    subject: SubjectEntity,
    targetStatus: SubjectStatus,
    auditAction: AuditAction,
    user: UserEntity,
    manager: EntityManager,
    options?: {
      notifyFactoryOnApprove?: boolean;
      notifyProductOnSubmit?: boolean;
      forceProjectInReview?: boolean;
    },
  ): Promise<SubmitSubjectResponseDto> {
    const subjectRepo = manager.getRepository(SubjectEntity);
    const projectRepo = manager.getRepository(ProjectEntity);
    const subjectId = subject.id;

    const previousSubjectStatus = subject.status;
    const statusChanged = previousSubjectStatus !== targetStatus;

    if (statusChanged) {
      subject.status = targetStatus;
      await subjectRepo.save(subject);
      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
          fromStatus: previousSubjectStatus,
          toStatus: targetStatus,
          changedById: user.id,
        },
        manager,
      );
    }

    if (statusChanged) {
      await this.auditService.createLog(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
          action: auditAction,
          userId: user.id,
          beforeJson: { status: previousSubjectStatus },
          afterJson: { status: targetStatus },
        },
        manager,
      );
    }

    if (options?.notifyProductOnSubmit && statusChanged && subject.project.productOwner?.id) {
      await this.notificationsService.notifyUser(
        subject.project.productOwner.id,
        {
          type: NotificationType.ACTION,
          title: 'Asignatura enviada a revisión',
          message: `La asignatura "${subject.name}" fue enviada a revisión por Fábrica.`,
          entityType: 'SUBJECT',
          entityId: subjectId,
          eventType: NotificationEventType.SUBJECT_SENT_TO_PRODUCT,
          projectId: subject.project.id,
          subjectId,
          actionUrl: `/subjects/${subjectId}`,
          severity: 'attention',
        },
        manager,
      );
    }

    if (options?.notifyFactoryOnApprove && statusChanged) {
      await this.notificationsService.notifyFactoryOwner(
        subject.project.factoryOwner?.id,
        {
          type: NotificationType.INFO,
          title: 'Materia aprobada',
          message: `Product aprobó la asignatura ${subject.name}.`,
          entityType: 'SUBJECT',
          entityId: subjectId,
          eventType: NotificationEventType.SUBJECT_APPROVED,
          projectId: subject.project.id,
          subjectId,
          actionUrl: `/subjects/${subjectId}`,
          severity: 'info',
        },
        manager,
      );
    }

    const semesterStatus = await this.semesterWorkflowService.updateSemesterStatus(
      subject.semester.id,
      user.id,
      manager,
      subject.semester.status,
    );

    if (options?.forceProjectInReview) {
      const previousProjectStatus = subject.project.status;
      if (previousProjectStatus !== ProjectStatus.IN_REVIEW) {
        subject.project.status = ProjectStatus.IN_REVIEW;
        await projectRepo.save(subject.project);
        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'PROJECT',
            entityId: subject.project.id,
            fromStatus: previousProjectStatus,
            toStatus: ProjectStatus.IN_REVIEW,
            changedById: user.id,
          },
          manager,
        );
      }
    }

    const projectStatus = await this.projectWorkflowService.updateProjectStatus(
      subject.project.id,
      user.id,
      manager,
      subject.project.status,
    );
    const projectProgress = await this.progressService.calculateProjectProgress(
      subject.project.id,
      manager,
    );

    const refreshedSubject = await subjectRepo.findOne({ where: { id: subjectId } });

    return {
      subjectId,
      subjectStatus: refreshedSubject!.status,
      subjectProgress: refreshedSubject!.progress,
      semesterId: subject.semester.id,
      semesterStatus,
      projectId: subject.project.id,
      projectStatus,
      projectProgress,
    };
  }
}
