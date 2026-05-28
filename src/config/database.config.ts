import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TlsOptions } from 'tls';
import { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from '../database/entities';

function resolveSslOptions(url: string): boolean | TlsOptions | undefined {
  if (/sslmode=disable/i.test(url)) {
    return false;
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

export function buildDataSourceOptions(): DataSourceOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const url = process.env.DATABASE_URL;

  if (!url) {
    // TypeORM will throw a clearer error, but we fail early for better DX.
    throw new Error('DATABASE_URL is required');
  }

  const ssl = resolveSslOptions(url);

  return {
    type: 'postgres',
    url,
    ...(ssl !== undefined ? { ssl } : {}),
    synchronize: false,
    connectTimeoutMS: 10000,
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
    retryAttempts: 1,
    retryDelay: 1000,
  };
}
