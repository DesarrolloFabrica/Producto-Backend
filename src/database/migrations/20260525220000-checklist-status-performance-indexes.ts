import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChecklistStatusPerformanceIndexes20260525220000 implements MigrationInterface {
  name = 'ChecklistStatusPerformanceIndexes20260525220000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_checklist_items_subject_status" ON "checklist_items" ("subjectId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_observations_project_status" ON "observations" ("projectId", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_subjects_semester_active" ON "subjects" ("semesterId") WHERE "deletedAt" IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_subjects_semester_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_observations_project_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_checklist_items_subject_status"');
  }
}
