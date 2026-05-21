import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StatusHistoryEntity } from './status-history.entity';

@Injectable()
export class StatusHistoryService {
  constructor(
    @InjectRepository(StatusHistoryEntity)
    private readonly statusHistoryRepo: Repository<StatusHistoryEntity>,
  ) {}

  async recordIfChanged(
    input: {
      entityType: string;
      entityId: string;
      fromStatus: string | null;
      toStatus: string;
      changedById: string;
    },
    manager?: EntityManager,
  ): Promise<StatusHistoryEntity | null> {
    if (input.fromStatus === input.toStatus) {
      return null;
    }

    const repo = manager
      ? manager.getRepository(StatusHistoryEntity)
      : this.statusHistoryRepo;

    const entry = repo.create({
      entityType: input.entityType,
      entityId: input.entityId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      changedBy: { id: input.changedById },
    });

    return await repo.save(entry);
  }
}
