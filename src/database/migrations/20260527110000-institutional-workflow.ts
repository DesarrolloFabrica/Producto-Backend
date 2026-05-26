import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstitutionalWorkflow20260527110000 implements MigrationInterface {
  name = 'InstitutionalWorkflow20260527110000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "institutional_operational_state" AS ENUM (
        'PENDING_PLANNING_INITIAL_VALIDATION',
        'RETURNED_TO_PRODUCT_FROM_PLANNING',
        'PENDING_FACTORY',
        'IN_FACTORY_PRODUCTION',
        'PENDING_PLANNING_PRODUCTION_VALIDATION',
        'RETURNED_TO_FACTORY_FROM_PLANNING',
        'PENDING_LMS_UPLOAD',
        'IN_LMS_UPLOAD',
        'PENDING_PLANNING_LMS_VALIDATION',
        'RETURNED_TO_LMS_FROM_PLANNING',
        'PENDING_PRODUCT_ACADEMIC_REVIEW',
        'IN_PRODUCT_ACADEMIC_REVIEW',
        'CHANGES_REQUESTED_BY_PRODUCT',
        'PENDING_FINAL_RADICATION',
        'FINALIZED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "institutional_operational_action" AS ENUM (
        'INSTITUTIONAL_SUBJECT_CREATED',
        'PLANNING_VALIDATE_INITIAL',
        'PLANNING_RETURN_INITIAL',
        'FACTORY_START_PRODUCTION',
        'FACTORY_DELIVER_CONTENT',
        'PLANNING_VALIDATE_PRODUCTION',
        'PLANNING_RETURN_PRODUCTION',
        'LMS_START_UPLOAD',
        'LMS_CONFIRM_UPLOAD',
        'PLANNING_VALIDATE_LMS',
        'PLANNING_RETURN_LMS',
        'PRODUCT_START_ACADEMIC_REVIEW',
        'PRODUCT_REQUEST_CHANGES',
        'PRODUCT_APPROVE_ACADEMIC',
        'PLANNING_FINALIZE',
        'PRODUCT_RESUBMIT_REQUEST'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "operational_check_key" AS ENUM (
        'PLANNING_INITIAL_VALIDATED',
        'FACTORY_CONTENT_DELIVERED',
        'PLANNING_PRODUCTION_VALIDATED',
        'LMS_UPLOAD_COMPLETED',
        'PLANNING_LMS_VALIDATED',
        'PRODUCT_ACADEMIC_APPROVED',
        'PLANNING_FINAL_RADICATED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "operational_check_status" AS ENUM ('PENDING', 'CHECKED', 'RETURNED')
    `);

    await queryRunner.query(`
      ALTER TABLE "subjects"
        ADD COLUMN "operational_state" "institutional_operational_state"
          NOT NULL DEFAULT 'PENDING_PLANNING_INITIAL_VALIDATION',
        ADD COLUMN "operational_stage_entered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN "operational_stage_due_at" TIMESTAMPTZ NULL,
        ADD COLUMN "operational_finalized_at" TIMESTAMPTZ NULL,
        ADD COLUMN "last_return_reason" TEXT NULL,
        ADD COLUMN "last_return_at" TIMESTAMPTZ NULL,
        ADD COLUMN "last_return_by_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "subjects"
        ADD CONSTRAINT "FK_subjects_last_return_by"
        FOREIGN KEY ("last_return_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_subjects_operational_state" ON "subjects" ("operational_state")
    `);

    await queryRunner.query(`
      CREATE TABLE "subject_operational_checks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subjectId" uuid NOT NULL,
        "checkKey" "operational_check_key" NOT NULL,
        "label" varchar(200) NOT NULL,
        "status" "operational_check_status" NOT NULL DEFAULT 'PENDING',
        "checkedAt" TIMESTAMPTZ NULL,
        "checkedById" uuid NULL,
        "comment" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subject_operational_checks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subject_operational_checks_subject_key" UNIQUE ("subjectId", "checkKey"),
        CONSTRAINT "FK_subject_operational_checks_subject" FOREIGN KEY ("subjectId")
          REFERENCES "subjects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subject_operational_checks_checked_by" FOREIGN KEY ("checkedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "operational_transitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subjectId" uuid NOT NULL,
        "fromState" "institutional_operational_state" NULL,
        "toState" "institutional_operational_state" NOT NULL,
        "action" "institutional_operational_action" NOT NULL,
        "actorId" uuid NOT NULL,
        "actorRole" "user_role" NOT NULL,
        "comment" TEXT NULL,
        "returnReason" TEXT NULL,
        "evidenceUrl" varchar(500) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_operational_transitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_operational_transitions_subject" FOREIGN KEY ("subjectId")
          REFERENCES "subjects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_operational_transitions_actor" FOREIGN KEY ("actorId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_operational_transitions_subject" ON "operational_transitions" ("subjectId")
    `);

    await queryRunner.query(`
      ALTER TABLE "projects" ADD COLUMN "legacy_workflow" boolean NOT NULL DEFAULT false
    `);

    // Backfill: proyectos ya entregados/cerrados quedan en flujo legacy
    await queryRunner.query(`
      UPDATE "projects" SET "legacy_workflow" = true
      WHERE "status" IN ('DELIVERED_TO_LMS', 'CLOSED')
    `);

    await queryRunner.query(`
      UPDATE "subjects" s SET "operational_state" = 'IN_FACTORY_PRODUCTION'
      FROM "projects" p
      WHERE s."projectId" = p.id AND p."legacy_workflow" = false
        AND s."status" = 'IN_PRODUCTION'
    `);

    await queryRunner.query(`
      UPDATE "subjects" s SET "operational_state" = 'PENDING_PLANNING_PRODUCTION_VALIDATION'
      FROM "projects" p
      WHERE s."projectId" = p.id AND p."legacy_workflow" = false
        AND s."status" IN ('SUBMITTED', 'IN_REVIEW')
    `);

    await queryRunner.query(`
      UPDATE "subjects" s SET "operational_state" = 'CHANGES_REQUESTED_BY_PRODUCT'
      FROM "projects" p
      WHERE s."projectId" = p.id AND p."legacy_workflow" = false
        AND s."status" = 'CHANGES_REQUESTED'
    `);

    await queryRunner.query(`
      UPDATE "subjects" s SET "operational_state" = 'PENDING_FINAL_RADICATION'
      FROM "projects" p
      WHERE s."projectId" = p.id AND p."legacy_workflow" = false
        AND s."status" = 'APPROVED'
    `);

    await queryRunner.query(`
      UPDATE "subjects" s SET "operational_state" = 'FINALIZED'
      FROM "projects" p
      WHERE s."projectId" = p.id AND p."legacy_workflow" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "operational_transitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subject_operational_checks"`);
    await queryRunner.query(`ALTER TABLE "subjects" DROP CONSTRAINT IF EXISTS "FK_subjects_last_return_by"`);
    await queryRunner.query(`
      ALTER TABLE "subjects"
        DROP COLUMN IF EXISTS "last_return_by_id",
        DROP COLUMN IF EXISTS "last_return_at",
        DROP COLUMN IF EXISTS "last_return_reason",
        DROP COLUMN IF EXISTS "operational_finalized_at",
        DROP COLUMN IF EXISTS "operational_stage_due_at",
        DROP COLUMN IF EXISTS "operational_stage_entered_at",
        DROP COLUMN IF EXISTS "operational_state"
    `);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "legacy_workflow"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "operational_check_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "operational_check_key"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "institutional_operational_action"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "institutional_operational_state"`);
  }
}
