import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { SchoolEntity } from './school.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SchoolEntity]), AuthModule],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
