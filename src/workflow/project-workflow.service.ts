import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationsService } from '../observations/observations.service';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';

@Injectable()
export class ProjectWorkflowService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    private readonly statusHistoryService: StatusHistoryService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
  ) {}

  async hasRejectedChecklistForProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(ChecklistItemEntity) : this.checklistRepo;

    const count = await repo
      .createQueryBuilder('c')
      .innerJoin('c.subject', 'subject')
      .where('subject.projectId = :projectId', { projectId })
      .andWhere('subject.deletedAt IS NULL')
      .andWhere('c.status = :status', { status: ChecklistStatus.RECHAZADO })
      .getCount();

    return count > 0;
  }

  async deriveProjectStatus(projectId: string, manager?: EntityManager): Promise<ProjectStatus> {
    const projectRepo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;

    const project = await projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (project.status === ProjectStatus.CLOSED) {
      return ProjectStatus.CLOSED;
    }
    // Entrega final (enum persistido DELIVERED_TO_LMS); no recalcular hacia atrás.
    if (project.status === ProjectStatus.DELIVERED_TO_LMS) {
      return ProjectStatus.DELIVERED_TO_LMS;
    }

    const subjects = await subjectRepo.find({
      where: { project: { id: projectId }, deletedAt: IsNull() },
    });

    const hasBlocking = await this.observationsService.hasBlockingObservationsForProject(
      projectId,
      manager,
    );
    const hasRejected = await this.hasRejectedChecklistForProject(projectId, manager);

    if (hasBlocking || hasRejected) {
      return ProjectStatus.FEEDBACK_PENDING;
    }

    if (subjects.some((s) => s.status === SubjectStatus.CHANGES_REQUESTED)) {
      return ProjectStatus.FEEDBACK_PENDING;
    }

    if (subjects.some((s) => s.status === SubjectStatus.IN_REVIEW)) {
      return ProjectStatus.IN_REVIEW;
    }

    if (
      subjects.some(
        (s) => s.status === SubjectStatus.SUBMITTED || s.status === SubjectStatus.IN_REVIEW,
      )
    ) {
      return ProjectStatus.IN_REVIEW;
    }

    if (subjects.some((s) => s.status === SubjectStatus.IN_PRODUCTION)) {
      return ProjectStatus.IN_PRODUCTION;
    }

    if (subjects.length > 0 && subjects.every((s) => s.status === SubjectStatus.APPROVED)) {
      return ProjectStatus.IN_REVIEW;
    }

    return project.status;
  }

  async updateProjectStatus(
    projectId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ProjectEntity> {
    const projectRepo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;
    const project = await projectRepo.findOne({ where: { id: projectId } });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const nextStatus = await this.deriveProjectStatus(projectId, manager);
    const previousStatus = project.status;

    if (previousStatus !== nextStatus) {
      project.status = nextStatus;
      await projectRepo.save(project);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          changedById: userId,
        },
        manager,
      );
    }

    return project;
  }
}
