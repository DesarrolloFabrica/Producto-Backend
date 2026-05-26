import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { AppDataSource } from '../data-source';

loadEnv();
import { UserEntity } from '../../users/user.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import * as bcrypt from 'bcrypt';

type SeedUser = Pick<UserEntity, 'email' | 'name' | 'role' | 'status'>;

const BASE_USERS: SeedUser[] = [
  { email: 'product@local', name: 'Producto', role: UserRole.PRODUCT, status: UserStatus.ACTIVE },
  { email: 'fabrica@local', name: 'Fabrica', role: UserRole.FABRICA, status: UserStatus.ACTIVE },
  { email: 'planeacion@local', name: 'Planeacion', role: UserRole.PLANEACION, status: UserStatus.ACTIVE },
  { email: 'lms@local', name: 'LMS', role: UserRole.LMS, status: UserStatus.ACTIVE },
  { email: 'admin@local', name: 'Admin', role: UserRole.ADMIN, status: UserStatus.ACTIVE },
];

function getSaltRounds(): number {
  const raw = process.env.BCRYPT_SALT_ROUNDS;
  const n = raw ? Number(raw) : 10;
  if (!Number.isInteger(n) || n < 4 || n > 15) {
    throw new Error('BCRYPT_SALT_ROUNDS must be an integer between 4 and 15');
  }
  return n;
}

/** Debe coincidir con accesos dev del frontend (LoginPage). */
const DEV_PASSWORD_FALLBACKS: Record<string, string> = {
  SEED_PRODUCT_PASSWORD: 'Product123!',
  SEED_FABRICA_PASSWORD: 'Fabrica123!',
  SEED_PLANEACION_PASSWORD: 'Planeacion123!',
  SEED_LMS_PASSWORD: 'Lms123!',
  SEED_ADMIN_PASSWORD: 'Admin123!',
};

function getSeedPassword(key: string): string {
  const v = process.env[key];
  if (v && v.trim()) return v;
  const fallback = process.env.SEED_DEFAULT_PASSWORD;
  if (fallback && fallback.trim()) return fallback;
  const devFallback = DEV_PASSWORD_FALLBACKS[key];
  if (devFallback && (process.env.NODE_ENV ?? 'development') !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[seed] ${key} no definido; usando contraseña dev local.`);
    return devFallback;
  }
  throw new Error(
    `Missing ${key} (or SEED_DEFAULT_PASSWORD). Refusing to seed plain/empty passwords.`,
  );
}

async function runSeed() {
  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(UserEntity);
    const saltRounds = getSaltRounds();

    for (const u of BASE_USERS) {
      const pwKey =
        u.role === UserRole.ADMIN
          ? 'SEED_ADMIN_PASSWORD'
          : u.role === UserRole.FABRICA
            ? 'SEED_FABRICA_PASSWORD'
            : u.role === UserRole.PLANEACION
              ? 'SEED_PLANEACION_PASSWORD'
              : u.role === UserRole.LMS
                ? 'SEED_LMS_PASSWORD'
                : 'SEED_PRODUCT_PASSWORD';
      const password = getSeedPassword(pwKey);
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Idempotent seed: upsert by unique email.
      await repo.upsert(
        {
          email: u.email.toLowerCase(),
          name: u.name,
          role: u.role,
          status: u.status,
          passwordHash,
        },
        { conflictPaths: ['email'] },
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

runSeed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
