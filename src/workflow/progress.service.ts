import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';

interface SubjectProgressAggregateRow {
  mainAvg: string | number | null;
  mainCount: string | number | null;
  topicAvg: string | number | null;
  topicCount: string | number | null;
}

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

    const row = await checklistRepo
      .createQueryBuilder('c')
      .select(
        `COALESCE(AVG(
          CASE WHEN c."topicId" IS NULL THEN
            CASE c.status
              WHEN '${ChecklistStatus.APROBADO}' THEN 1
              WHEN '${ChecklistStatus.ENTREGADO}' THEN 1
              WHEN '${ChecklistStatus.EN_PRODUCCION}' THEN 0.5
              ELSE 0
            END
          END
        ), 0)`,
        'mainAvg',
      )
      .addSelect('COUNT(*) FILTER (WHERE c."topicId" IS NULL)::int', 'mainCount')
      .addSelect(
        `COALESCE(AVG(
          CASE WHEN c."topicId" IS NOT NULL THEN
            CASE c.status
              WHEN '${ChecklistStatus.APROBADO}' THEN 1
              WHEN '${ChecklistStatus.ENTREGADO}' THEN 1
              WHEN '${ChecklistStatus.EN_PRODUCCION}' THEN 0.5
              ELSE 0
            END
          END
        ), 0)`,
        'topicAvg',
      )
      .addSelect('COUNT(*) FILTER (WHERE c."topicId" IS NOT NULL)::int', 'topicCount')
      .where('c."subjectId" = :subjectId', { subjectId })
      .getRawOne<SubjectProgressAggregateRow>();

    const mainCount = Number(row?.mainCount ?? 0);
    const topicCount = Number(row?.topicCount ?? 0);
    const mainScore = mainCount > 0 ? Number(row?.mainAvg ?? 0) : 0;
    const topicScore = topicCount > 0 ? Number(row?.topicAvg ?? 0) : 0;
    const progress = Math.round((mainScore * 0.7 + topicScore * 0.3) * 100);

    await subjectRepo.update({ id: subjectId }, { progress });
    return progress;
  }

  async calculateProjectProgress(
    projectId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;
    const projectRepo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;

    const row = await subjectRepo
      .createQueryBuilder('s')
      .select('COALESCE(ROUND(AVG(s.progress)), 0)::int', 'progress')
      .where('s."projectId" = :projectId', { projectId })
      .andWhere('s."deletedAt" IS NULL')
      .getRawOne<{ progress: string | number }>();

    const progress = Number(row?.progress ?? 0);
    await projectRepo.update({ id: projectId }, { progress });
    return progress;
  }

  async recalculateTreeFromSubject(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<{ subjectProgress: number; projectProgress: number; projectId: string }> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;
    const subject = await subjectRepo.findOne({
      where: { id: subjectId },
      select: { id: true, project: { id: true } },
      relations: { project: true },
    });

    if (!subject) {
      throw new Error(`Subject ${subjectId} not found`);
    }

    const subjectProgress = await this.calculateSubjectProgress(subjectId, manager);
    const projectProgress = await this.calculateProjectProgress(subject.project.id, manager);

    return { subjectProgress, projectProgress, projectId: subject.project.id };
  }
}
