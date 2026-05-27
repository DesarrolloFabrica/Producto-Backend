import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TopicEntity } from './topic.entity';
import { TopicsController } from './topics.controller';
import { TopicItemsController } from './topic-items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TopicEntity]), AuthModule, forwardRef(() => SubjectsModule)],
  controllers: [TopicsController, TopicItemsController],
  exports: [TypeOrmModule],
})
export class TopicsModule {}
