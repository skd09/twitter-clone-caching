// The timeline API returns only `user_id` -- there is no author name, handle or
// avatar in the schema. Everything below is derived from that id so the UI never
// displays a value the backend did not actually give us.

export function displayName(userId: number): string {
  return `User ${userId}`;
}

export function handle(userId: number): string {
  return `@user${userId}`;
}

export function initials(userId: number): string {
  return `U${userId}`.slice(0, 2).toUpperCase();
}

const AVATAR_TINTS = [
  'bg-[#1d9bf0]',
  'bg-[#f91880]',
  'bg-[#00ba7c]',
  'bg-[#7856ff]',
  'bg-[#ff7a00]',
  'bg-[#ffd400]',
];

export function avatarTint(userId: number): string {
  return AVATAR_TINTS[userId % AVATAR_TINTS.length];
}

/** Twitter-style: 45s -> "45s", 20m -> "20m", 5h -> "5h", older -> "Sep 28". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** 1200 -> "1.2K", 3400000 -> "3.4M". Twitter drops the count entirely at 0. */
export function compactCount(n: number): string {
  if (n <= 0) return '';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0', '');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0', '');
}
