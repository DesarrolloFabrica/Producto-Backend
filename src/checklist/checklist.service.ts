import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { ProjectsService } from '../projects/projects.service';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { SemesterWorkflowService } from '../workflow/semester-workflow.service';
import { SubjectWorkflowService } from '../workflow/subject-workflow.service';
import { assertChecklistStatusTransition } from './checklist-transitions';
import { ChecklistItemEntity } from './checklist-item.entity';
import { ChecklistStatusUpdateResponseDto } from './dto/checklist-status-update-response.dto';
import { UpdateChecklistStatusDto } from './dto/update-checklist-status.dto';

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
      const checklistRepo = manager.getRepository(ChecklistItemEntity);
      const subjectRepo = manager.getRepository(SubjectEntity);

      const item = await checklistRepo.findOne({
        where: { id: checklistItemId },
        relations: {
          subject: {
            project: { productOwner: true, factoryOwner: true },
            semester: true,
          },
        },
      });

      if (!item) {
        throw new NotFoundException('Checklist item not found');
      }

      const project = item.subject.project;
      this.projectsService.assertCanModifyProject(project, user);

      const previousStatus = item.status;
      assertChecklistStatusTransition(user.role, previousStatus, dto.status);

      item.status = dto.status;
      item.updatedBy = { id: user.id } as UserEntity;
      await checklistRepo.save(item);

      await this.auditService.createLog(
        {
          entityType: RelatedEntityType.CHECKLIST_ITEM,
          entityId: item.id,
          action: AuditAction.CHECKLIST_UPDATE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: dto.status },
        },
        manager,
      );

      const subjectId = item.subject.id;
      const semesterId = item.subject.semester.id;
      const projectId = project.id;

      await this.progressService.calculateSubjectProgress(subjectId, manager);
      const subject = await this.subjectWorkflowService.updateSubjectStatus(
        subjectId,
        user.id,
        manager,
      );
      const semester = await this.semesterWorkflowService.updateSemesterStatus(
        semesterId,
        user.id,
        manager,
      );
      const updatedProject = await this.projectWorkflowService.updateProjectStatus(
        projectId,
        user.id,
        manager,
      );
      const projectProgress = await this.progressService.calculateProjectProgress(
        projectId,
        manager,
      );

      const refreshedSubject = await subjectRepo.findOne({ where: { id: subjectId } });
      if (!refreshedSubject) {
        throw new NotFoundException('Subject not found after update');
      }

      return {
        checklistItemId: item.id,
        checklistStatus: item.status,
        subjectId,
        subjectStatus: refreshedSubject.status,
        subjectProgress: refreshedSubject.progress,
        semesterId,
        semesterStatus: semester.status,
        projectId,
        projectStatus: updatedProject.status,
        projectProgress,
      };
    });
  }
}
