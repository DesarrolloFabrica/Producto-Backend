import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { isSubjectFactoryProductionComplete } from './factory-production.util';

describe('isSubjectFactoryProductionComplete', () => {
  it('returns true when factory production status is COMPLETED', () => {
    expect(
      isSubjectFactoryProductionComplete({
        factoryProductionStatus: FactoryProductionStatus.COMPLETED,
        progress: 0,
      }),
    ).toBe(true);
  });

  it('returns true when progress is 100 even if status is not COMPLETED', () => {
    expect(
      isSubjectFactoryProductionComplete({
        factoryProductionStatus: FactoryProductionStatus.IN_PROGRESS,
        progress: 100,
      }),
    ).toBe(true);
  });

  it('returns false when neither completed nor progress 100', () => {
    expect(
      isSubjectFactoryProductionComplete({
        factoryProductionStatus: FactoryProductionStatus.NOT_STARTED,
        progress: 50,
      }),
    ).toBe(false);
  });
});
