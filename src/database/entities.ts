import { AuditLogEntity } from '../audit/audit-log.entity';
import { StatusHistoryEntity } from '../audit/status-history.entity';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { ObservationMessageEntity } from '../observations/observation-message.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { LinkResourceEntity } from '../projects/link-resource.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';

export const ALL_ENTITIES = [
  UserEntity,
  ProjectEntity,
  SemesterEntity,
  SubjectEntity,
  TopicEntity,
  ChecklistItemEntity,
  ObservationEntity,
  ObservationMessageEntity,
  LinkResourceEntity,
  AuditLogEntity,
  StatusHistoryEntity,
  NotificationEntity,
];
