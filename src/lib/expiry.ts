import { dayKeyOf, isoWeekday } from './date';

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

/** Ostrzeżenie tylko w ostatnich 2 dniach przed wygaśnięciem; po wygaśnięciu aplikacja i tak nie wstanie. */
export function isExpiringSoon(expiresAt: number | null, now: number): boolean {
  if (expiresAt === null) return false;
  const left = expiresAt - now;
  return left > 0 && left <= TWO_DAYS;
}

const WHEN = ['w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę', 'w niedzielę'];

/** „w czwartek” — dzień tygodnia wygaśnięcia (Europe/Warsaw) z przyimkiem. */
export function expiryWhen(expiresAt: number): string {
  return WHEN[isoWeekday(dayKeyOf(expiresAt)) - 1];
}
