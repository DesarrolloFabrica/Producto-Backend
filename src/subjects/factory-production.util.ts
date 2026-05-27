import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { SubjectEntity } from './subject.entity';

export function isSubjectFactoryProductionComplete(subject: Pick<SubjectEntity, 'factoryProductionStatus' | 'progress'>): boolean {
  return (
    subject.factoryProductionStatus === FactoryProductionStatus.COMPLETED || subject.progress >= 100
  );
}
