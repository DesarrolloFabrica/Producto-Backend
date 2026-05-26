import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectRadicationWorkflow20260601100000 implements MigrationInterface {
  name = 'ProjectRadicationWorkflow20260601100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "institutional_operational_state"
      RENAME VALUE 'PENDING_FINAL_RADICATION' TO 'PENDING_PROJECT_RADICATION'
    `);

    await queryRunner.query(`
      CREATE TYPE "project_institutional_state" AS ENUM (
        'INSTITUTIONAL_IN_PROGRESS',
        'READY_FOR_PRODUCT_RADICATION',
        'PENDING_PLANNING_RADICATION_CHECK',
        'RADICATION_RETURNED_TO_PRODUCT',
        'FINALIZED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "project_institutional_action" AS ENUM (
        'PRODUCT_REGISTER_RADICATION',
        'PRODUCT_RESUBMIT_RADICATION',
        'PLANNING_VALIDATE_RADICATION',
        'PLANNING_RETURN_RADICATION',
        'AUTO_READY_FOR_RADICATION'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "project_radication_status" AS ENUM (
        'ACTIVE',
        'RETURNED',
        'VALIDATED',
        'SUPERSEDED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD COLUMN "institutional_state" "project_institutional_state" NULL,
        ADD COLUMN "institutional_scope_locked_at" TIMESTAMPTZ NULL,
        ADD COLUMN "radication_number" varchar(120) NULL,
        ADD COLUMN "radicated_at" TIMESTAMPTZ NULL,
        ADD COLUMN "radicated_by_id" uuid NULL,
        ADD COLUMN "radication_comment" TEXT NULL,
        ADD COLUMN "radication_evidence_url" varchar(500) NULL,
        ADD COLUMN "ready_for_radication_at" TIMESTAMPTZ NULL,
        ADD COLUMN "product_radication_due_at" TIMESTAMPTZ NULL,
        ADD COLUMN "planning_radication_check_due_at" TIMESTAMPTZ NULL,
        ADD COLUMN "last_radication_return_reason" TEXT NULL,
        ADD COLUMN "last_radication_returned_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD CONSTRAINT "FK_projects_radicated_by"
        FOREIGN KEY ("radicated_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "project_radications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid NOT NULL,
        "radicationNumber" varchar(120) NOT NULL,
        "radicatedAt" TIMESTAMPTZ NOT NULL,
        "registeredById" uuid NOT NULL,
        "comment" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "status" "project_radication_status" NOT NULL DEFAULT 'ACTIVE',
        "returnReason" TEXT NULL,
        "returnedAt" TIMESTAMPTZ NULL,
        "returnedById" uuid NULL,
        "validatedAt" TIMESTAMPTZ NULL,
        "validatedById" uuid NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_radications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_radications_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_radications_registered_by" FOREIGN KEY ("registeredById")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_project_radications_returned_by" FOREIGN KEY ("returnedById")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_project_radications_validated_by" FOREIGN KEY ("validatedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "project_operational_transitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "projectId" uuid NOT NULL,
        "fromState" "project_institutional_state" NULL,
        "toState" "project_institutional_state" NOT NULL,
        "action" "project_institutional_action" NOT NULL,
        "actorId" uuid NOT NULL,
        "actorRole" "user_role" NOT NULL,
        "comment" TEXT NULL,
        "returnReason" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "radicationNumber" varchar(120) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_project_operational_transitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_operational_transitions_project" FOREIGN KEY ("projectId")
          REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_operational_transitions_actor" FOREIGN KEY ("actorId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      UPDATE "projects" p
      SET "institutional_state" = 'INSTITUTIONAL_IN_PROGRESS'
      WHERE p."legacy_workflow" = false AND p."deletedAt" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "projects" p
      SET "institutional_state" = 'READY_FOR_PRODUCT_RADICATION',
          "ready_for_radication_at" = NOW()
      WHERE p."legacy_workflow" = false
        AND p."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "subjects" s
          INNER JOIN "semesters" sem ON sem."id" = s."semesterId"
          WHERE s."projectId" = p."id"
            AND s."deletedAt" IS NULL
            AND sem."deletedAt" IS NULL
            AND sem."created_from_change" = false
            AND s."operational_state" != 'PENDING_PROJECT_RADICATION'
            AND s."operational_state" != 'FINALIZED'
        )
        AND EXISTS (
          SELECT 1 FROM "subjects" s
          INNER JOIN "semesters" sem ON sem."id" = s."semesterId"
          WHERE s."projectId" = p."id"
            AND s."deletedAt" IS NULL
            AND sem."deletedAt" IS NULL
            AND sem."created_from_change" = false
        )
    `);

    await queryRunner.query(`
      UPDATE "projects" p
      SET "institutional_state" = 'FINALIZED'
      WHERE p."legacy_workflow" = false
        AND p."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "subjects" s
          INNER JOIN "semesters" sem ON sem."id" = s."semesterId"
          WHERE s."projectId" = p."id"
            AND s."deletedAt" IS NULL
            AND sem."deletedAt" IS NULL
            AND sem."created_from_change" = false
            AND s."operational_state" != 'FINALIZED'
        )
        AND EXISTS (
          SELECT 1 FROM "subjects" s
          WHERE s."projectId" = p."id" AND s."deletedAt" IS NULL
        )
    `);

    await queryRunner.query(`
      UPDATE "projects" p
      SET "institutional_scope_locked_at" = NOW()
      WHERE p."legacy_workflow" = false
        AND p."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "subjects" s
          WHERE s."projectId" = p."id"
            AND s."deletedAt" IS NULL
            AND s."operational_state" NOT IN (
              'PENDING_PLANNING_INITIAL_VALIDATION',
              'RETURNED_TO_PRODUCT_FROM_PLANNING'
            )
        )
    `);

    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PROJECT_READY_FOR_RADICATION'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PRODUCT_REGISTERED_RADICATION'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PLANNING_RADICATION_RETURNED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PRODUCT_RESUBMITTED_RADICATION'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PLANNING_RADICATION_VALIDATED'
    `);
    await queryRunner.query(`
      ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'PROJECT_FINALIZED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "project_operational_transitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_radications"`);
    await queryRunner.query(`
      ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "FK_projects_radicated_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "projects"
        DROP COLUMN IF EXISTS "last_radication_returned_at",
        DROP COLUMN IF EXISTS "last_radication_return_reason",
        DROP COLUMN IF EXISTS "planning_radication_check_due_at",
        DROP COLUMN IF EXISTS "product_radication_due_at",
        DROP COLUMN IF EXISTS "ready_for_radication_at",
        DROP COLUMN IF EXISTS "radication_evidence_url",
        DROP COLUMN IF EXISTS "radication_comment",
        DROP COLUMN IF EXISTS "radicated_by_id",
        DROP COLUMN IF EXISTS "radicated_at",
        DROP COLUMN IF EXISTS "radication_number",
        DROP COLUMN IF EXISTS "institutional_scope_locked_at",
        DROP COLUMN IF EXISTS "institutional_state"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "project_radication_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "project_institutional_action"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "project_institutional_state"`);
    await queryRunner.query(`
      ALTER TYPE "institutional_operational_state"
      RENAME VALUE 'PENDING_PROJECT_RADICATION' TO 'PENDING_FINAL_RADICATION'
    `);
  }
}
