import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStatus } from '../common/enums/user-status.enum';
import { UserResponseDto } from './dto/user-response.dto';
import { UserEntity } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  toSafeUser(user: UserEntity): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findAllSafe(): Promise<UserResponseDto[]> {
    const users = await this.usersRepo.find({ order: { createdAt: 'ASC' } });
    return users.map((user) => this.toSafeUser(user));
  }

  async findSafeById(id: string): Promise<UserResponseDto | null> {
    const user = await this.findById(id);
    if (!user) return null;
    return this.toSafeUser(user);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return await this.usersRepo.findOne({ where: { id } });
  }

  async findByIdWithPassword(
    id: string,
  ): Promise<(UserEntity & { passwordHash: string | null }) | null> {
    return (await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne()) as (UserEntity & { passwordHash: string | null }) | null;
  }

  async findActiveById(id: string): Promise<UserEntity | null> {
    return await this.usersRepo.findOne({ where: { id, status: UserStatus.ACTIVE } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return await this.usersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findActiveByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    return await this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
      .getOne();
  }

  async findActiveByEmailWithPassword(
    email: string,
  ): Promise<(UserEntity & { passwordHash: string | null }) | null> {
    return (await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
      .getOne()) as (UserEntity & { passwordHash: string | null }) | null;
  }
}
