import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildDatabaseOptions(): TypeOrmModuleOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const url = process.env.DATABASE_URL;

  if (!url) {
    // TypeORM will throw a clearer error, but we fail early for better DX.
    throw new Error('DATABASE_URL is required');
  }

  return {
    type: 'postgres',
    url,
    // Entities will be registered via feature modules as they are introduced.
    autoLoadEntities: true,
    synchronize: false,
    logging: isProd ? ['error', 'warn'] : ['error', 'warn', 'schema'],
    migrationsTableName: 'typeorm_migrations',
    migrations: ['dist/database/migrations/*.js'],
  };
}
