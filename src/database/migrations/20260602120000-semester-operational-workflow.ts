import { MigrationInterface, QueryRunner } from 'typeorm';

export class SemesterOperationalWorkflow20260602120000 implements MigrationInterface {
  name = 'SemesterOperationalWorkflow20260602120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "semesters"
        ADD COLUMN IF NOT EXISTS "operational_state" "institutional_operational_state" NOT NULL DEFAULT 'PENDING_PLANNING_INITIAL_VALIDATION',
        ADD COLUMN IF NOT EXISTS "operational_stage_entered_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "operational_stage_due_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "operational_finalized_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "last_return_reason" TEXT NULL,
        ADD COLUMN IF NOT EXISTS "last_return_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "last_return_by_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "lock_version" int NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "semesters"
        ADD CONSTRAINT "FK_semesters_last_return_by"
        FOREIGN KEY ("last_return_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          sem.id AS "semesterId",
          (ARRAY_AGG(s."operational_state" ORDER BY CASE s."operational_state"
            WHEN 'PENDING_PLANNING_INITIAL_VALIDATION' THEN 1
            WHEN 'RETURNED_TO_PRODUCT_FROM_PLANNING' THEN 2
            WHEN 'PENDING_FACTORY' THEN 3
            WHEN 'IN_FACTORY_PRODUCTION' THEN 4
            WHEN 'PENDING_PLANNING_PRODUCTION_VALIDATION' THEN 5
            WHEN 'RETURNED_TO_FACTORY_FROM_PLANNING' THEN 6
            WHEN 'PENDING_LMS_UPLOAD' THEN 7
            WHEN 'IN_LMS_UPLOAD' THEN 8
            WHEN 'PENDING_PLANNING_LMS_VALIDATION' THEN 9
            WHEN 'RETURNED_TO_LMS_FROM_PLANNING' THEN 10
            WHEN 'PENDING_PRODUCT_ACADEMIC_REVIEW' THEN 11
            WHEN 'IN_PRODUCT_ACADEMIC_REVIEW' THEN 12
            WHEN 'CHANGES_REQUESTED_BY_PRODUCT' THEN 13
            WHEN 'PENDING_PROJECT_RADICATION' THEN 14
            WHEN 'FINALIZED' THEN 15
            ELSE 1
          END ASC))[1] AS state,
          MIN(s."operational_stage_entered_at") AS entered,
          MIN(s."operational_stage_due_at") AS due
        FROM "semesters" sem
        INNER JOIN "subjects" s ON s."semesterId" = sem.id AND s."deletedAt" IS NULL
        WHERE sem."deletedAt" IS NULL
        GROUP BY sem.id
      )
      UPDATE "semesters" sem
      SET "operational_state" = ranked.state,
          "operational_stage_entered_at" = COALESCE(ranked.entered, sem."operational_stage_entered_at"),
          "operational_stage_due_at" = ranked.due
      FROM ranked
      WHERE sem.id = ranked."semesterId"
    `);

    await queryRunner.query(`
      CREATE TABLE "semester_operational_checks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "semesterId" uuid NOT NULL,
        "checkKey" "operational_check_key" NOT NULL,
        "label" varchar(200) NOT NULL,
        "status" "operational_check_status" NOT NULL DEFAULT 'PENDING',
        "checkedAt" TIMESTAMPTZ NULL,
        "checkedById" uuid NULL,
        "comment" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_semester_operational_checks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_semester_operational_checks_sem_key" UNIQUE ("semesterId", "checkKey"),
        CONSTRAINT "FK_semester_operational_checks_semester" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_semester_operational_checks_checked_by" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_semester_operational_checks_semester" ON "semester_operational_checks" ("semesterId")`);

    await queryRunner.query(`
      CREATE TABLE "semester_operational_transitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "semesterId" uuid NOT NULL,
        "fromState" "institutional_operational_state" NULL,
        "toState" "institutional_operational_state" NOT NULL,
        "action" "institutional_operational_action" NOT NULL,
        "actorId" uuid NOT NULL,
        "actorRole" "user_role" NOT NULL,
        "comment" TEXT NULL,
        "returnReason" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "metadata" jsonb NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_semester_operational_transitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_semester_operational_transitions_semester" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_semester_operational_transitions_actor" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_semester_operational_transitions_semester" ON "semester_operational_transitions" ("semesterId")`);

    await queryRunner.query(`
      INSERT INTO "semester_operational_transitions"
        ("semesterId", "fromState", "toState", "action", "actorId", "actorRole", "comment", "metadata")
      SELECT
        sem.id,
        NULL,
        sem."operational_state",
        'INSTITUTIONAL_SUBJECT_CREATED',
        COALESCE(p."productOwnerId", (SELECT u.id FROM "users" u ORDER BY u."createdAt" ASC LIMIT 1)),
        'ADMIN',
        'Backfill desde flujo por asignatura',
        jsonb_build_object('source', 'subjects.operational_state')
      FROM "semesters" sem
      INNER JOIN "projects" p ON p.id = sem."projectId"
      WHERE sem."deletedAt" IS NULL
        AND COALESCE(p."productOwnerId", (SELECT u.id FROM "users" u ORDER BY u."createdAt" ASC LIMIT 1)) IS NOT NULL
    `);

    await queryRunner.query(`CREATE TYPE "observation_batch_scope" AS ENUM ('SUBJECT', 'SEMESTER', 'PROJECT')`);
    await queryRunner.query(`
      ALTER TABLE "observation_batches"
        ADD COLUMN IF NOT EXISTS "semesterId" uuid NULL,
        ADD COLUMN IF NOT EXISTS "scope" "observation_batch_scope" NOT NULL DEFAULT 'SUBJECT'
    `);
    await queryRunner.query(`
      ALTER TABLE "observation_batches"
        ALTER COLUMN "subjectId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "observation_batches"
        ADD CONSTRAINT "FK_observation_batches_semester"
        FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_observation_batches_semester" ON "observation_batches" ("semesterId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_observation_batches_semester"`);
    await queryRunner.query(`ALTER TABLE "observation_batches" DROP CONSTRAINT IF EXISTS "FK_observation_batches_semester"`);
    await queryRunner.query(`ALTER TABLE "observation_batches" DROP COLUMN IF EXISTS "scope"`);
    await queryRunner.query(`ALTER TABLE "observation_batches" DROP COLUMN IF EXISTS "semesterId"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "observation_batch_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "semester_operational_transitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "semester_operational_checks"`);
    await queryRunner.query(`ALTER TABLE "semesters" DROP CONSTRAINT IF EXISTS "FK_semesters_last_return_by"`);
    await queryRunner.query(`
      ALTER TABLE "semesters"
        DROP COLUMN IF EXISTS "lock_version",
        DROP COLUMN IF EXISTS "last_return_by_id",
        DROP COLUMN IF EXISTS "last_return_at",
        DROP COLUMN IF EXISTS "last_return_reason",
        DROP COLUMN IF EXISTS "operational_finalized_at",
        DROP COLUMN IF EXISTS "operational_stage_due_at",
        DROP COLUMN IF EXISTS "operational_stage_entered_at",
        DROP COLUMN IF EXISTS "operational_state"
    `);
  }
}
