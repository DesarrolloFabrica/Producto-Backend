import { MigrationInterface, QueryRunner } from 'typeorm';

const OFFICIAL_SCHOOLS = [
  'Bellas Artes',
  'Especializaciones',
  'Transformación Empresarial',
  'Transversales',
  'Ingenierías',
  'Negocios',
] as const;

const PROJECT_SCHOOL_RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'Escuela de Ingenierias', to: 'Ingenierías' },
  { from: 'Escuela de Ciencias Administrativas', to: 'Negocios' },
  { from: 'Escuela de Comunicacion y Bellas Artes', to: 'Bellas Artes' },
];

export class SchoolsCatalog20260601140000 implements MigrationInterface {
  name = 'SchoolsCatalog20260601140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE "schools" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(150) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schools" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_schools_name" UNIQUE ("name")
      )
    `);

    for (const name of OFFICIAL_SCHOOLS) {
      const escaped = name.replace(/'/g, "''");
      await queryRunner.query(`
        INSERT INTO "schools" ("name")
        VALUES ('${escaped}')
        ON CONFLICT ("name") DO NOTHING
      `);
    }

    for (const { from, to } of PROJECT_SCHOOL_RENAMES) {
      const fromEscaped = from.replace(/'/g, "''");
      const toEscaped = to.replace(/'/g, "''");
      await queryRunner.query(`
        UPDATE "projects"
        SET "school" = '${toEscaped}'
        WHERE "school" = '${fromEscaped}'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { from, to } of [...PROJECT_SCHOOL_RENAMES].reverse()) {
      const fromEscaped = from.replace(/'/g, "''");
      const toEscaped = to.replace(/'/g, "''");
      await queryRunner.query(`
        UPDATE "projects"
        SET "school" = '${fromEscaped}'
        WHERE "school" = '${toEscaped}'
      `);
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "schools"`);
  }
}
