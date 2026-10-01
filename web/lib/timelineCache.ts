/**
 * Browser-side persistence of the last good timeline. Not an API concern -- the
 * gateway in lib/api never touches storage -- but it is what lets a reload paint
 * immediately instead of waiting out a corrupt cache hit.
 */

import { toTweets, type Tweet } from './types';

const STORE_PREFIX = 'pulse:timeline:';

export type CachedTimeline = { tweets: Tweet[]; savedAt: number };

export function readCachedTimeline(userId: number): CachedTimeline | null {
  try {
    const raw = window.localStorage.getItem(`${STORE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedTimeline>;
    const tweets = toTweets(parsed?.tweets);
    if (tweets === null) return null;
    return { tweets, savedAt: Number(parsed.savedAt) || Date.now() };
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
