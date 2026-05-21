import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopicEntity } from './topic.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TopicEntity])],
  exports: [TypeOrmModule],
})
export class TopicsModule {}
