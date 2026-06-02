import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchoolCatalogItemDto } from './dto/school-catalog-item.dto';
import { SchoolEntity } from './school.entity';

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(SchoolEntity)
    private readonly schoolsRepo: Repository<SchoolEntity>,
  ) {}

  async listActiveSchools(): Promise<SchoolCatalogItemDto[]> {
    const rows = await this.schoolsRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: { id: true, name: true },
    });

    return rows.map((row) => ({ id: row.id, name: row.name }));
  }
}
