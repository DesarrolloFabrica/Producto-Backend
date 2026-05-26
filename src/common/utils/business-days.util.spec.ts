import { addBusinessDays } from './business-days.util';

describe('addBusinessDays', () => {
  it('sums weekdays and skips weekends', () => {
    const friday = new Date(2026, 4, 22);
    const result = addBusinessDays(friday, 1);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(25);
  });

  it('adds 22 business days from activation', () => {
    const monday = new Date(2026, 4, 26);
    const result = addBusinessDays(monday, 22);
    expect(result.getDay()).not.toBe(0);
    expect(result.getDay()).not.toBe(6);
    const diffMs = result.getTime() - monday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(30);
    expect(diffDays).toBeLessThanOrEqual(32);
  });

  it('respects optional holidays when provided', () => {
    const start = new Date(2026, 4, 26);
    const holiday = new Date(2026, 4, 27);
    const withoutHoliday = addBusinessDays(start, 1);
    const withHoliday = addBusinessDays(start, 1, { holidays: [holiday] });
    expect(withHoliday.getTime()).toBeGreaterThan(withoutHoliday.getTime());
  });
});
