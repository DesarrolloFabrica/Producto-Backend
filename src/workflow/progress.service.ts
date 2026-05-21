import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
  ) {}

  scoreChecklistItem(status: ChecklistStatus): number {
    if (status === ChecklistStatus.APROBADO || status === ChecklistStatus.ENTREGADO) {
      return 1;
    }
    if (status === ChecklistStatus.EN_PRODUCCION) {
      return 0.5;
    }
    return 0;
  }

  computeProgressFromItems(items: ChecklistItemEntity[]): number {
    const mainItems = items.filter((item) => !item.topic);
    const topicItems = items.filter((item) => !!item.topic);

    const avg = (list: ChecklistItemEntity[]) => {
      if (list.length === 0) return 0;
      const sum = list.reduce((acc, item) => acc + this.scoreChecklistItem(item.status), 0);
      return sum / list.length;
    };

    const weighted = avg(mainItems) * 0.7 + avg(topicItems) * 0.3;
    return Math.round(weighted * 100);
  }

  async calculateSubjectProgress(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const checklistRepo = manager
      ? manager.getRepository(ChecklistItemEntity)
      : this.checklistRepo;
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;

    const items = await checklistRepo.find({
      where: { subject: { id: subjectId } },
      relations: { topic: true },
    });

    const progress = this.computeProgressFromItems(items);
    await subjectRepo.update({ id: subjectId }, { progress });
    return progress;
  }

  async calculateProjectProgress(
    projectId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;
    const projectRepo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;

    const subjects = await subjectRepo.find({
      where: { project: { id: projectId }, deletedAt: IsNull() },
    });

    if (subjects.length === 0) {
      await projectRepo.update({ id: projectId }, { progress: 0 });
      return 0;
    }

    const progress = Math.round(
      subjects.reduce((sum, s) => sum + s.progress, 0) / subjects.length,
    );
    await projectRepo.update({ id: projectId }, { progress });
    return progress;
  }

  async recalculateTreeFromSubject(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<{ subjectProgress: number; projectId: string }> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;
    const subject = await subjectRepo.findOne({
      where: { id: subjectId },
      relations: { project: true },
    });

    if (!subject) {
      throw new Error(`Subject ${subjectId} not found`);
    }

    const subjectProgress = await this.calculateSubjectProgress(subjectId, manager);
    await this.calculateProjectProgress(subject.project.id, manager);

    return { subjectProgress, projectId: subject.project.id };
  }
}
