import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv();
import { buildDataSourceOptions } from '../config/database.config';
import { ALL_ENTITIES } from './entities';

// TypeORM CLI entrypoint.
// Uses DATABASE_URL and points to compiled migrations.
export const AppDataSource = new DataSource({
  ...buildDataSourceOptions(),
  entities: ALL_ENTITIES,
  migrations: ['dist/database/migrations/*.js'],
});
