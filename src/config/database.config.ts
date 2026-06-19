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

function isRemoteDatabase(url: string): boolean {
  return !/localhost|127\.0\.0\.1/i.test(url);
}

function buildPgPoolExtra(url: string): Record<string, unknown> {
  const remote = isRemoteDatabase(url);
  return {
    max: remote ? 8 : 10,
    // Cloud SQL / hosts remotos suelen cerrar conexiones idle; reciclar antes.
    idleTimeoutMillis: remote ? 30_000 : 60_000,
    connectionTimeoutMillis: remote ? 25_000 : 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };
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
    extra: buildPgPoolExtra(url),
    logging: isProd ? ['error', 'warn'] : ['error', 'warn', 'schema'],
    migrationsTableName: 'typeorm_migrations',
    migrations: ['dist/database/migrations/*.js'],
    migrationsRun: isProd && process.env.RUN_MIGRATIONS_ON_START !== 'false',
  };
}

export function buildDatabaseOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL ?? '';
  const remote = isRemoteDatabase(url);
  return {
    ...buildDataSourceOptions(),
    entities: ALL_ENTITIES,
    autoLoadEntities: true,
    retryAttempts: remote ? 5 : 2,
    retryDelay: remote ? 3000 : 1000,
  };
}
