import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemesterEntity } from './semester.entity';
import { AuthModule } from '../auth/auth.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { SemestersController } from './semesters.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SemesterEntity]), AuthModule, forwardRef(() => SubjectsModule)],
  controllers: [SemestersController],
  exports: [TypeOrmModule],
})
export class SemestersModule {}
