/**
 * Browser-side persistence of the last good timeline. Not an API concern -- the
 * gateway in lib/api never touches storage -- but it is what lets a reload paint
 * immediately instead of waiting out a corrupt cache hit.
 */

import type { Tweet } from './types';

const STORE_PREFIX = 'pulse:timeline:';

export type CachedTimeline = { tweets: Tweet[]; savedAt: number };

function isTweet(value: unknown): value is Tweet {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'number' &&
    typeof t.user_id === 'number' &&
    typeof t.body === 'string' &&
    typeof t.like_count === 'number' &&
    typeof t.created_at === 'string'
  );
}

export function readCachedTimeline(userId: number): CachedTimeline | null {
  try {
    const raw = window.localStorage.getItem(`${STORE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTimeline;
    if (!Array.isArray(parsed?.tweets) || !parsed.tweets.every(isTweet)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedTimeline(userId: number, tweets: Tweet[]): void {
  try {
    window.localStorage.setItem(
      `${STORE_PREFIX}${userId}`,
      JSON.stringify({ tweets, savedAt: Date.now() } satisfies CachedTimeline)
    );
  } catch {
    // Private mode or a full quota: the in-memory copy still works.
  }
}
