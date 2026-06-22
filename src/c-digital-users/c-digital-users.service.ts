import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../common/enums/audit-action.enum';
import { UserEntity } from '../users/user.entity';
import { CDigitalUserEntity } from './c-digital-user.entity';
import { CDigitalUsersCrypto } from './c-digital-users.crypto';
import {
  CDigitalUserResponseDto,
  PaginatedCDigitalUsersResponseDto,
} from './dto/c-digital-user-response.dto';
import { CreateCDigitalUserDto } from './dto/create-c-digital-user.dto';
import { QueryCDigitalUsersDto } from './dto/query-c-digital-users.dto';
import { UpdateCDigitalUserDto } from './dto/update-c-digital-user.dto';

@Injectable()
export class CDigitalUsersService {
  constructor(
    @InjectRepository(CDigitalUserEntity)
    private readonly cDigitalUsersRepo: Repository<CDigitalUserEntity>,
    private readonly crypto: CDigitalUsersCrypto,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryCDigitalUsersDto): Promise<PaginatedCDigitalUsersResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const qb = this.cDigitalUsersRepo
      .createQueryBuilder('credential')
      .leftJoinAndSelect('credential.createdBy', 'createdBy')
      .leftJoinAndSelect('credential.updatedBy', 'updatedBy')
      .where('credential.deletedAt IS NULL');

    const programName = this.normalizeOptional(query.programName);
    if (programName) {
      qb.andWhere('credential.programName ILIKE :programName', { programName: `%${programName}%` });
    }

    const username = this.normalizeOptional(query.username);
    if (username) {
      qb.andWhere('credential.username ILIKE :username', { username: `%${username}%` });
    }

    if (query.createdAt) {
      const date = new Date(query.createdAt);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Fecha de creación inválida');
      }
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      qb.andWhere(
        new Brackets((dateQb) => {
          dateQb
            .where('credential.createdAt >= :createdFrom', { createdFrom: date.toISOString() })
            .andWhere('credential.createdAt < :createdTo', { createdTo: nextDate.toISOString() });
        }),
      );
    }

    qb.orderBy('credential.createdAt', query.order === 'oldest' ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);
    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async create(dto: CreateCDigitalUserDto, user: UserEntity): Promise<CDigitalUserResponseDto> {
    const programName = this.normalizeRequired(dto.programName, 'Programa');
    const username = this.normalizeRequired(dto.username, 'Usuario');
    const password = this.normalizeRequired(dto.password, 'Contraseña');

    const credential = this.cDigitalUsersRepo.create({
      programName,
      username,
      passwordEncrypted: this.crypto.encrypt(password),
      createdBy: user,
      updatedBy: user,
    });

    return this.toResponse(await this.cDigitalUsersRepo.save(credential));
  }

  async update(
    id: string,
    dto: UpdateCDigitalUserDto,
    user: UserEntity,
  ): Promise<CDigitalUserResponseDto> {
    const credential = await this.findEntity(id);

    if (dto.programName !== undefined) {
      credential.programName = this.normalizeRequired(dto.programName, 'Programa');
    }

    if (dto.username !== undefined) {
      credential.username = this.normalizeRequired(dto.username, 'Usuario');
    }

    if (dto.password !== undefined) {
      credential.passwordEncrypted = this.crypto.encrypt(
        this.normalizeRequired(dto.password, 'Contraseña'),
      );
    }

    credential.updatedBy = user;

    return this.toResponse(await this.cDigitalUsersRepo.save(credential));
  }

  async remove(id: string, user: UserEntity): Promise<void> {
    const credential = await this.findEntity(id);
    credential.updatedBy = user;
    await this.cDigitalUsersRepo.save(credential);
    await this.cDigitalUsersRepo.softRemove(credential);
  }

  async revealPassword(id: string, user: UserEntity): Promise<{ password: string }> {
    const credential = await this.findEntity(id);
    await this.auditService.createLog({
      entityType: 'C_DIGITAL_USER',
      entityId: credential.id,
      action: AuditAction.C_DIGITAL_PASSWORD_REVEALED,
      userId: user.id,
      beforeJson: null,
      afterJson: {
        programName: credential.programName,
        username: credential.username,
        revealedAt: new Date().toISOString(),
      },
    });

    return { password: this.crypto.decrypt(credential.passwordEncrypted) };
  }

  private async findEntity(id: string): Promise<CDigitalUserEntity> {
    const credential = await this.cDigitalUsersRepo.findOne({
      where: { id },
      relations: { createdBy: true, updatedBy: true },
    });
    if (!credential) throw new NotFoundException('Registro no encontrado');
    return credential;
  }

  private toResponse(entity: CDigitalUserEntity): CDigitalUserResponseDto {
    return {
      id: entity.id,
      programName: entity.programName,
      username: entity.username,
      passwordProtected: true,
      createdBy: this.toAuditUser(entity.createdBy),
      updatedBy: entity.updatedBy ? this.toAuditUser(entity.updatedBy) : null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toAuditUser(user: UserEntity) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  private normalizeRequired(value: string, label: string): string {
    const normalized = this.normalizeOptional(value);
    if (!normalized) throw new BadRequestException(`${label} es obligatorio`);
    return normalized;
  }

  private normalizeOptional(value?: string): string {
    return (value ?? '').trim().replace(/\s+/g, ' ');
  }
}
