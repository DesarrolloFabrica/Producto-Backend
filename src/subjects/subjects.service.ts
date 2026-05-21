import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ObservationsService } from '../observations/observations.service';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsService } from '../projects/projects.service';
import { UserEntity } from '../users/user.entity';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { SemesterWorkflowService } from '../workflow/semester-workflow.service';
import { SubjectWorkflowService } from '../workflow/subject-workflow.service';
import { RejectSubjectDto } from './dto/reject-subject.dto';
import { SubmitSubjectResponseDto } from './dto/submit-subject-response.dto';
import { SubjectEntity } from './subject.entity';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    private readonly projectsService: ProjectsService,
    private readonly observationsService: ObservationsService,
    private readonly auditService: AuditService,
    private readonly statusHistoryService: StatusHistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly progressService: ProgressService,
    private readonly subjectWorkflowService: SubjectWorkflowService,
    private readonly semesterWorkflowService: SemesterWorkflowService,
    private readonly projectWorkflowService: ProjectWorkflowService,
  ) {}

  async submit(subjectId: string, user: UserEntity): Promise<SubmitSubjectResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only FABRICA or ADMIN can submit subjects');
    }

    return await this.dataSource.transaction(async (manager) => {
      const { subject, items } = await this.loadSubjectContext(subjectId, user, manager);
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

    return await this.dataSource.transaction(async (manager) => {
      const { subject, items } = await this.loadSubjectContext(subjectId, user, manager);
      this.projectsService.assertCanManageAsProductOwner(subject.project, user);
      this.validateChecklistForApprove(items);
      await this.assertNoBlockingObservations(subjectId, manager);

      const result = await this.applySubjectStatusChange(
        subject,
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

    return await this.dataSource.transaction(async (manager) => {
      const { subject } = await this.loadSubjectContext(subjectId, user, manager);
      this.projectsService.assertCanManageAsProductOwner(subject.project, user);

      const previousSubjectStatus = subject.status;
      subject.status = SubjectStatus.CHANGES_REQUESTED;
      await manager.getRepository(SubjectEntity).save(subject);

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
      const previousProjectStatus = subject.project.status;
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

      await this.auditService.createLog(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
          action: AuditAction.REJECT,
          userId: user.id,
          beforeJson: { status: previousSubjectStatus },
          afterJson: {
            status: SubjectStatus.CHANGES_REQUESTED,
            reason: dto.reason ?? null,
          },
        },
        manager,
      );

      await this.notificationsService.notifyFactoryOwner(
        subject.project.factoryOwner?.id,
        {
          type: NotificationType.CRITICAL,
          title: 'Asignatura rechazada',
          message: dto.reason
            ? `La asignatura "${subject.name}" fue rechazada: ${dto.reason}`
            : `La asignatura "${subject.name}" fue rechazada. Revisa los cambios solicitados.`,
          entityType: 'SUBJECT',
          entityId: subjectId,
        },
        manager,
      );

      const semester = await this.semesterWorkflowService.updateSemesterStatus(
        subject.semester.id,
        user.id,
        manager,
      );
      const project = await this.projectWorkflowService.updateProjectStatus(
        subject.project.id,
        user.id,
        manager,
      );
      const projectProgress = await this.progressService.calculateProjectProgress(
        project.id,
        manager,
      );
      const refreshedSubject = await manager.getRepository(SubjectEntity).findOne({
        where: { id: subjectId },
      });

      return {
        subjectId,
        subjectStatus: refreshedSubject!.status,
        subjectProgress: refreshedSubject!.progress,
        semesterId: semester.id,
        semesterStatus: semester.status,
        projectId: project.id,
        projectStatus: project.status,
        projectProgress,
      };
    });
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
    if (items.length === 0) {
      throw new BadRequestException('Subject has no checklist items');
    }
    if (items.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      throw new BadRequestException('Cannot submit subject with rejected checklist items');
    }
    const allDeliveredOrApproved = items.every((item) =>
      [ChecklistStatus.ENTREGADO, ChecklistStatus.APROBADO].includes(item.status),
    );
    if (!allDeliveredOrApproved) {
      throw new BadRequestException(
        'All checklist items must be ENTREGADO or APROBADO before submit',
      );
    }
  }

  private validateChecklistForApprove(items: ChecklistItemEntity[]): void {
    if (items.length === 0) {
      throw new BadRequestException('Subject has no checklist items');
    }
    if (items.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      throw new BadRequestException('Cannot approve subject with rejected checklist items');
    }
    if (items.some((item) => item.status === ChecklistStatus.ENTREGADO)) {
      throw new BadRequestException(
        'All checklist items must be APROBADO before approval; some are only ENTREGADO',
      );
    }
    if (!items.every((item) => item.status === ChecklistStatus.APROBADO)) {
      throw new BadRequestException('All checklist items must be APROBADO before approval');
    }
  }

  private async assertNoBlockingObservations(
    subjectId: string,
    manager: EntityManager,
  ): Promise<void> {
    if (await this.observationsService.hasBlockingObservationsForSubject(subjectId, manager)) {
      throw new BadRequestException(
        'Subject has blocking observations (ABIERTA or EN_CORRECCION)',
      );
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
    if (previousSubjectStatus !== targetStatus) {
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

    if (options?.notifyProductOnSubmit && subject.project.productOwner?.id) {
      await this.notificationsService.notifyUser(
        subject.project.productOwner.id,
        {
          type: NotificationType.ACTION,
          title: 'Asignatura enviada a revisión',
          message: `La asignatura "${subject.name}" fue enviada a revisión por Fábrica.`,
          entityType: 'SUBJECT',
          entityId: subjectId,
        },
        manager,
      );
    }

    if (options?.notifyFactoryOnApprove) {
      await this.notificationsService.notifyFactoryOwner(
        subject.project.factoryOwner?.id,
        {
          type: NotificationType.ACTION,
          title: 'Asignatura aprobada',
          message: `La asignatura "${subject.name}" fue aprobada por Producto.`,
          entityType: 'SUBJECT',
          entityId: subjectId,
        },
        manager,
      );
    }

    const semester = await this.semesterWorkflowService.updateSemesterStatus(
      subject.semester.id,
      user.id,
      manager,
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

    const project = await this.projectWorkflowService.updateProjectStatus(
      subject.project.id,
      user.id,
      manager,
    );
    const projectProgress = await this.progressService.calculateProjectProgress(
      project.id,
      manager,
    );

    const refreshedSubject = await subjectRepo.findOne({ where: { id: subjectId } });

    return {
      subjectId,
      subjectStatus: refreshedSubject!.status,
      subjectProgress: refreshedSubject!.progress,
      semesterId: semester.id,
      semesterStatus: semester.status,
      projectId: project.id,
      projectStatus: project.status,
      projectProgress,
    };
  }
}
