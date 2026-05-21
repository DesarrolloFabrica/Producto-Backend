import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from '../config/database.config';

@Module({
  imports: [
    ...(process.env.DATABASE_URL
      ? [
          TypeOrmModule.forRoot({
            ...buildDatabaseOptions(),
          }),
        ]
      : []),
  ],
})
export class DatabaseModule {}

if (!process.env.DATABASE_URL) {
  // Allow the service to boot (e.g., for /health) even without DB in early setup.
  new Logger('DatabaseModule').warn('DATABASE_URL not set; TypeORM is disabled.');
}
