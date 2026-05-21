import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemesterEntity } from './semester.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SemesterEntity])],
  exports: [TypeOrmModule],
})
export class SemestersModule {}
