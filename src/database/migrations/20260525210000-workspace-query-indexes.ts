import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkspaceQueryIndexes20260525210000 implements MigrationInterface {
  name = 'WorkspaceQueryIndexes20260525210000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_observations_topic" ON "observations" ("topicId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_observations_checklist_item" ON "observations" ("checklistItemId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_observations_checklist_item"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_observations_topic"');
  }
}
