import { describe, expect, it } from 'vitest';
import { expiryWhen, isExpiringSoon } from '../src/lib/expiry';

const DAY = 86_400_000;
describe('ostrzeżenie o wygaśnięciu', () => {
  const now = Date.UTC(2026, 10, 18, 10);
  it('okno 0 < pozostało ≤ 2 dni', () => {
    expect(isExpiringSoon(null, now)).toBe(false);
    expect(isExpiringSoon(now + 3 * DAY, now)).toBe(false);
    expect(isExpiringSoon(now + 2 * DAY, now)).toBe(true);
    expect(isExpiringSoon(now + 1, now)).toBe(true);
    expect(isExpiringSoon(now, now)).toBe(false);
    expect(isExpiringSoon(now - DAY, now)).toBe(false);
  });
  it('dzień tygodnia z przyimkiem', () => {
    expect(expiryWhen(Date.UTC(2026, 10, 19, 10))).toBe('w czwartek'); // 19.11.2026 = czwartek
    expect(expiryWhen(Date.UTC(2026, 10, 17, 10))).toBe('we wtorek');
    expect(expiryWhen(Date.UTC(2026, 10, 18, 10))).toBe('w środę');
  });
});
