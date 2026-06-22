import { SchoolEntity } from '../catalogs/school.entity';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { StatusHistoryEntity } from '../audit/status-history.entity';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { EmailDeliveryLogEntity } from '../email/email-delivery-log.entity';
import { CDigitalUserEntity } from '../c-digital-users/c-digital-user.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { ObservationMessageEntity } from '../observations/observation-message.entity';
import { ObservationBatchEntity } from '../observations/observation-batch.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { SemesterOperationalCheckEntity } from '../institutional-workflow/semester-operational-check.entity';
import { SemesterOperationalTransitionEntity } from '../institutional-workflow/semester-operational-transition.entity';
import { OperationalTransitionEntity } from '../institutional-workflow/operational-transition.entity';
import { SubjectOperationalCheckEntity } from '../institutional-workflow/subject-operational-check.entity';
import { ProjectOperationalTransitionEntity } from '../project-radication/project-operational-transition.entity';
import { ProjectRadicationEntity } from '../project-radication/project-radication.entity';
import { LinkResourceEntity } from '../projects/link-resource.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';

export const ALL_ENTITIES = [
  SchoolEntity,
  UserEntity,
  ProjectEntity,
  SemesterEntity,
  SubjectEntity,
  TopicEntity,
  ChecklistItemEntity,
  ObservationEntity,
  ObservationBatchEntity,
  ObservationMessageEntity,
  LinkResourceEntity,
  AuditLogEntity,
  StatusHistoryEntity,
  NotificationEntity,
  EmailDeliveryLogEntity,
  CDigitalUserEntity,
  SemesterOperationalCheckEntity,
  SemesterOperationalTransitionEntity,
  SubjectOperationalCheckEntity,
  OperationalTransitionEntity,
  ProjectRadicationEntity,
  ProjectOperationalTransitionEntity,
];
