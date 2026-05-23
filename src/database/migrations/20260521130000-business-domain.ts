import { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessDomain20260521130000 implements MigrationInterface {
  name = 'BusinessDomain20260521130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // 1. Enums
    await queryRunner.query(
      "CREATE TYPE \"modality\" AS ENUM ('VIRTUAL','HIBRIDA','PRESENCIAL')",
    );
    await queryRunner.query(
      "CREATE TYPE \"priority\" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL')",
    );
    await queryRunner.query(
      "CREATE TYPE \"project_status\" AS ENUM ('PENDING_SYLLABUS','READY_FOR_PRODUCTION','IN_PRODUCTION','IN_REVIEW','DELIVERED_TO_LMS','FEEDBACK_PENDING','CLOSED')",
    );
    await queryRunner.query(
      "CREATE TYPE \"semester_status\" AS ENUM ('PENDING','IN_PRODUCTION','PARTIAL_REVIEW','CHANGES_REQUESTED','APPROVED','DELIVERED')",
    );
    await queryRunner.query(
      "CREATE TYPE \"subject_status\" AS ENUM ('PENDING','IN_PRODUCTION','SUBMITTED','IN_REVIEW','CHANGES_REQUESTED','APPROVED','DELIVERED')",
    );
    await queryRunner.query(
      "CREATE TYPE \"checklist_status\" AS ENUM ('NO_EXISTE','PENDIENTE','EN_PRODUCCION','ENTREGADO','APROBADO','RECHAZADO')",
    );
    await queryRunner.query(
      "CREATE TYPE \"observation_status\" AS ENUM ('ABIERTA','EN_CORRECCION','RESUELTA')",
    );
    await queryRunner.query(
      "CREATE TYPE \"related_entity_type\" AS ENUM ('PROJECT','SEMESTER','SUBJECT','TOPIC','CHECKLIST_ITEM')",
    );
    await queryRunner.query(
      "CREATE TYPE \"notification_type\" AS ENUM ('INFO','ACTION','DEADLINE','CRITICAL')",
    );
    await queryRunner.query(
      "CREATE TYPE \"audit_action\" AS ENUM ('CREATE','UPDATE','DELETE','STATUS_CHANGE','CHECKLIST_UPDATE','OBSERVATION_CREATE','OBSERVATION_STATUS_CHANGE','SUBMIT','APPROVE','REJECT','DELIVER','CLOSE')",
    );

    // 2. projects
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "school" character varying(200) NOT NULL,
        "program" character varying(200) NOT NULL,
        "modality" "modality" NOT NULL,
        "requestType" character varying(120) NOT NULL,
        "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
        "status" "project_status" NOT NULL DEFAULT 'READY_FOR_PRODUCTION',
        "progress" integer NOT NULL DEFAULT 0,
        "productOwnerId" uuid NOT NULL,
        "factoryOwnerId" uuid,
        "expectedDeliveryDate" timestamptz NOT NULL,
        "observations" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_projects_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projects_product_owner" FOREIGN KEY ("productOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_projects_factory_owner" FOREIGN KEY ("factoryOwnerId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_projects_status" ON "projects" ("status")');
    await queryRunner.query('CREATE INDEX "IDX_projects_priority" ON "projects" ("priority")');
    await queryRunner.query(
      'CREATE INDEX "IDX_projects_product_owner" ON "projects" ("productOwnerId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_projects_factory_owner" ON "projects" ("factoryOwnerId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_projects_expected_delivery" ON "projects" ("expectedDeliveryDate")',
    );
    await queryRunner.query('CREATE INDEX "IDX_projects_deleted_at" ON "projects" ("deletedAt")');

    // 3. semesters
    await queryRunner.query(`
      CREATE TABLE "semesters" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL,
        "semesterNumber" integer NOT NULL,
        "status" "semester_status" NOT NULL DEFAULT 'PENDING',
        "factoryExpectedDate" timestamptz NOT NULL,
        "continuationDate" timestamptz,
        "observations" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_semesters_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_semesters_project_semester" UNIQUE ("projectId", "semesterNumber"),
        CONSTRAINT "FK_semesters_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_semesters_project" ON "semesters" ("projectId")');
    await queryRunner.query('CREATE INDEX "IDX_semesters_status" ON "semesters" ("status")');
    await queryRunner.query('CREATE INDEX "IDX_semesters_deleted_at" ON "semesters" ("deletedAt")');

    // 4. subjects
    await queryRunner.query(`
      CREATE TABLE "subjects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL,
        "semesterId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "expectedDeliveryDate" timestamptz,
        "status" "subject_status" NOT NULL DEFAULT 'PENDING',
        "progress" integer NOT NULL DEFAULT 0,
        "generalObservations" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_subjects_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subjects_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subjects_semester" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_subjects_project" ON "subjects" ("projectId")');
    await queryRunner.query('CREATE INDEX "IDX_subjects_semester" ON "subjects" ("semesterId")');
    await queryRunner.query('CREATE INDEX "IDX_subjects_status" ON "subjects" ("status")');
    await queryRunner.query('CREATE INDEX "IDX_subjects_deleted_at" ON "subjects" ("deletedAt")');

    // 5. topics
    await queryRunner.query(`
      CREATE TABLE "topics" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subjectId" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "order" integer NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_topics_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_topics_subject_order" UNIQUE ("subjectId", "order"),
        CONSTRAINT "FK_topics_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_topics_subject" ON "topics" ("subjectId")');
    await queryRunner.query('CREATE INDEX "IDX_topics_deleted_at" ON "topics" ("deletedAt")');

    // 6. checklist_items
    await queryRunner.query(`
      CREATE TABLE "checklist_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subjectId" uuid NOT NULL,
        "topicId" uuid,
        "category" character varying(120),
        "label" character varying(255) NOT NULL,
        "status" "checklist_status" NOT NULL DEFAULT 'PENDIENTE',
        "ownerRole" "user_role" NOT NULL,
        "observations" text,
        "updatedById" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_checklist_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_checklist_items_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_checklist_items_topic" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_checklist_items_updated_by" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_checklist_items_subject" ON "checklist_items" ("subjectId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_checklist_items_topic" ON "checklist_items" ("topicId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_checklist_items_status" ON "checklist_items" ("status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_checklist_items_owner_role" ON "checklist_items" ("ownerRole")',
    );

    // 7. observations
    await queryRunner.query(`
      CREATE TABLE "observations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL,
        "subjectId" uuid,
        "topicId" uuid,
        "checklistItemId" uuid,
        "authorId" uuid NOT NULL,
        "role" "user_role" NOT NULL,
        "text" text NOT NULL,
        "status" "observation_status" NOT NULL DEFAULT 'ABIERTA',
        "relatedEntityType" "related_entity_type" NOT NULL,
        "relatedEntityId" uuid NOT NULL,
        "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
        "dueDate" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "resolvedAt" timestamptz,
        "resolvedById" uuid,
        CONSTRAINT "PK_observations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_observations_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_observations_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_observations_topic" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_observations_checklist_item" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_observations_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_observations_resolved_by" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_observations_project" ON "observations" ("projectId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_observations_subject" ON "observations" ("subjectId")',
    );
    await queryRunner.query('CREATE INDEX "IDX_observations_status" ON "observations" ("status")');
    await queryRunner.query('CREATE INDEX "IDX_observations_role" ON "observations" ("role")');
    await queryRunner.query(
      'CREATE INDEX "IDX_observations_related_entity" ON "observations" ("relatedEntityType", "relatedEntityId")',
    );

    // 8. observation_messages
    await queryRunner.query(`
      CREATE TABLE "observation_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "observationId" uuid NOT NULL,
        "authorId" uuid NOT NULL,
        "message" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_observation_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_observation_messages_observation" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_observation_messages_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_observation_messages_observation" ON "observation_messages" ("observationId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_observation_messages_author" ON "observation_messages" ("authorId")',
    );

    // 9. link_resources
    await queryRunner.query(`
      CREATE TABLE "link_resources" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "url" character varying(2048) NOT NULL,
        "type" character varying(80) NOT NULL,
        "uploadedBy" "user_role" NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_link_resources_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_link_resources_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_link_resources_project" ON "link_resources" ("projectId")',
    );
    await queryRunner.query('CREATE INDEX "IDX_link_resources_type" ON "link_resources" ("type")');

    // 10. audit_logs
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entityType" character varying(80) NOT NULL,
        "entityId" character varying(36) NOT NULL,
        "action" "audit_action" NOT NULL,
        "userId" uuid NOT NULL,
        "beforeJson" jsonb,
        "afterJson" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entityType", "entityId")',
    );
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_user" ON "audit_logs" ("userId")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")');
    await queryRunner.query('CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt")');

    // 11. status_history
    await queryRunner.query(`
      CREATE TABLE "status_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entityType" character varying(80) NOT NULL,
        "entityId" character varying(36) NOT NULL,
        "fromStatus" character varying(80),
        "toStatus" character varying(80) NOT NULL,
        "changedById" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_history_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_status_history_changed_by" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_status_history_entity" ON "status_history" ("entityType", "entityId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_status_history_changed_by" ON "status_history" ("changedById")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_status_history_created_at" ON "status_history" ("createdAt")',
    );

    // 12. notifications
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid,
        "roleTarget" "user_role",
        "type" "notification_type" NOT NULL DEFAULT 'INFO',
        "title" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "isRead" boolean NOT NULL DEFAULT false,
        "entityType" character varying(80),
        "entityId" character varying(36),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_user" ON "notifications" ("userId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_role_target" ON "notifications" ("roleTarget")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_is_read" ON "notifications" ("isRead")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_entity" ON "notifications" ("entityType", "entityId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "notifications"');
    await queryRunner.query('DROP TABLE IF EXISTS "status_history"');
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "link_resources"');
    await queryRunner.query('DROP TABLE IF EXISTS "observation_messages"');
    await queryRunner.query('DROP TABLE IF EXISTS "observations"');
    await queryRunner.query('DROP TABLE IF EXISTS "checklist_items"');
    await queryRunner.query('DROP TABLE IF EXISTS "topics"');
    await queryRunner.query('DROP TABLE IF EXISTS "subjects"');
    await queryRunner.query('DROP TABLE IF EXISTS "semesters"');
    await queryRunner.query('DROP TABLE IF EXISTS "projects"');

    await queryRunner.query('DROP TYPE IF EXISTS "audit_action"');
    await queryRunner.query('DROP TYPE IF EXISTS "notification_type"');
    await queryRunner.query('DROP TYPE IF EXISTS "related_entity_type"');
    await queryRunner.query('DROP TYPE IF EXISTS "observation_status"');
    await queryRunner.query('DROP TYPE IF EXISTS "checklist_status"');
    await queryRunner.query('DROP TYPE IF EXISTS "subject_status"');
    await queryRunner.query('DROP TYPE IF EXISTS "semester_status"');
    await queryRunner.query('DROP TYPE IF EXISTS "project_status"');
    await queryRunner.query('DROP TYPE IF EXISTS "priority"');
    await queryRunner.query('DROP TYPE IF EXISTS "modality"');
  }
}
