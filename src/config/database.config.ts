import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from '../database/entities';

export function buildDataSourceOptions(): DataSourceOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const url = process.env.DATABASE_URL;

  if (!url) {
    // TypeORM will throw a clearer error, but we fail early for better DX.
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    synchronize: false,
    logging: isProd ? ['error', 'warn'] : ['error', 'warn', 'schema'],
    migrationsTableName: 'typeorm_migrations',
    migrations: ['dist/database/migrations/*.js'],
  };
}

export function buildDatabaseOptions(): TypeOrmModuleOptions {
  return {
    ...buildDataSourceOptions(),
    entities: ALL_ENTITIES,
    autoLoadEntities: true,
  };
}
