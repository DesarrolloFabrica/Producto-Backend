import { Brackets, Repository } from 'typeorm';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ObservationEntity } from './observation.entity';

const RESOLVED_SUBJECT_ID_SQL = `COALESCE(
  "obs"."subjectId"::text,
  CASE WHEN "obs"."relatedEntityType" = :subjectEntity THEN "obs"."relatedEntityId"::text END,
  "topic"."subjectId"::text,
  "checklistItem"."subjectId"::text
)`;

export function applyObservationsForSubjectsFilter(
  qb: ReturnType<Repository<ObservationEntity>['createQueryBuilder']>,
  subjectIds: string[],
  alias = 'obs',
): typeof qb {
  if (!subjectIds.length) {
    return qb.andWhere('1 = 0');
  }

  return qb.andWhere(
    new Brackets((sub) => {
      sub
        .where(`${alias}.subjectId IN (:...subjectIds)`, { subjectIds })
        .orWhere(
          `(${alias}.relatedEntityType = :subjectEntity AND ${alias}.relatedEntityId IN (:...subjectIds))`,
          { subjectEntity: RelatedEntityType.SUBJECT, subjectIds },
        )
        .orWhere(
          `${alias}.topicId IN (SELECT t.id FROM topics t WHERE t."subjectId" IN (:...subjectIds) AND t."deletedAt" IS NULL)`,
          { subjectIds },
        )
        .orWhere(
          `${alias}.checklistItemId IN (SELECT c.id FROM checklist_items c WHERE c."subjectId" IN (:...subjectIds))`,
          { subjectIds },
        );
    }),
  );
}

export async function loadProductObservationCountsBySubject(
  observationRepo: Repository<ObservationEntity>,
  subjectIds: string[],
): Promise<Map<string, { open: number; correctionSent: number }>> {
  const map = new Map<string, { open: number; correctionSent: number }>();
  if (!subjectIds.length) return map;

  const qb = observationRepo
    .createQueryBuilder('obs')
    .leftJoin('topics', 'topic', 'topic.id = obs.topicId')
    .leftJoin('checklist_items', 'checklistItem', 'checklistItem.id = obs.checklistItemId')
    .select(RESOLVED_SUBJECT_ID_SQL, 'resolvedSubjectId')
    .addSelect('obs.status', 'status')
    .addSelect('COUNT(*)', 'count')
    .where('obs.role = :role', { role: UserRole.PRODUCT })
    .andWhere(
      '(obs.status != :abierta OR obs."notificationStatus" = :sent)',
      { abierta: ObservationStatus.ABIERTA, sent: ObservationNotificationStatus.SENT },
    )
    .setParameter('subjectEntity', RelatedEntityType.SUBJECT);

  applyObservationsForSubjectsFilter(qb, subjectIds);

  const rows = await qb
    .groupBy(RESOLVED_SUBJECT_ID_SQL)
    .addGroupBy('obs.status')
    .getRawMany<{ resolvedSubjectId: string | null; status: ObservationStatus; count: string }>();

  for (const row of rows) {
    if (!row.resolvedSubjectId || !subjectIds.includes(row.resolvedSubjectId)) continue;
    const entry = map.get(row.resolvedSubjectId) ?? { open: 0, correctionSent: 0 };
    const count = Number(row.count) || 0;
    if (row.status === ObservationStatus.ABIERTA) entry.open += count;
    if (row.status === ObservationStatus.EN_CORRECCION) entry.correctionSent += count;
    map.set(row.resolvedSubjectId, entry);
  }

  return map;
}
