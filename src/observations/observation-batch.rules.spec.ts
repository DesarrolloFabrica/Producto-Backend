import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';

describe('observation notification batch rules', () => {
  it('treats ABIERTA as blocking only when notification was sent', () => {
    const blocking = (status: ObservationStatus, notificationStatus: ObservationNotificationStatus) =>
      status === ObservationStatus.ABIERTA && notificationStatus === ObservationNotificationStatus.SENT;

    expect(blocking(ObservationStatus.ABIERTA, ObservationNotificationStatus.PENDING)).toBe(false);
    expect(blocking(ObservationStatus.ABIERTA, ObservationNotificationStatus.SENT)).toBe(true);
    expect(blocking(ObservationStatus.EN_CORRECCION, ObservationNotificationStatus.SENT)).toBe(false);
  });
});
