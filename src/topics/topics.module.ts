import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TopicEntity } from './topic.entity';
import { TopicsController } from './topics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TopicEntity]), AuthModule, forwardRef(() => SubjectsModule)],
  controllers: [TopicsController],
  exports: [TypeOrmModule],
})
export class TopicsModule {}
