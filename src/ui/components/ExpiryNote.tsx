import { useEffect, useState } from 'preact/hooks';
import { getExpiry } from '../../native/pending';
import { expiryWhen, isExpiringSoon } from '../../lib/expiry';

/** Darmowy profil instalacyjny działa 7 dni — przypomnienie na dwa dni przed końcem. */
export function ExpiryNote({ now }: { now: number }) {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    getExpiry()
      .then((t) => alive && setExpiresAt(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (expiresAt === null || !isExpiringSoon(expiresAt, now)) return null;
  return <p class="note">Aplikacja wygasa {expiryWhen(expiresAt)}. Podłącz telefon do Maca, żeby ją odnowić.</p>;
}
