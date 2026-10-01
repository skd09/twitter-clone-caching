/**
 * The gateway surface. Every backend route the app uses is declared here once,
 * with its response validated before it reaches a component.
 *
 * Routes mirror app/routes/api.php.
 */

import type { Tweet } from '@/lib/types';
import { apiError, request, type ApiResult, type RequestOptions } from './client';

export type { ApiError, ApiErrorKind, ApiResult } from './client';
export { API_BASE_URL } from './client';

export type TimelinePayload = {
  tweets: Tweet[];
  /** HotKeyDetector verdict from the lab 7 controller. */
  hot: boolean;
};

export type LikePayload = { tweet_id: number; like_count: number };
export type BufferedLikePayload = { tweet_id: number; buffered_likes: number };

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

export const api = {
  timeline: {
    /**
     * GET /api/users/{id}/timeline
     *
     * The backend caches an Illuminate\Support\Collection, which its own cache
     * store will not unserialize (config/cache.php: serializable_classes =>
     * false). Every cache HIT therefore returns a 200 whose `data` is
     * `{"__PHP_Incomplete_Class_Name": "..."}` with the rows absent rather than
     * malformed -- nothing is recoverable client-side. That is surfaced as a
     * 'corrupt' error so callers can keep showing a saved copy and retry for the
     * one cache MISS per TTL that carries real rows, instead of treating it as
     * an outage.
     */
    async get(
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<TimelinePayload>> {
      const res = await request<{ data?: unknown; hot?: unknown }>(
        `/api/users/${userId}/timeline`,
        options
      );
      if (!res.ok) return res;

      const { data, hot } = res.data;
      if (!Array.isArray(data) || !data.every(isTweet)) {
        return {
          ok: false,
          error: apiError(
            'corrupt',
            'Timeline returned a cached payload with no usable rows'
          ),
        };
      }

      return { ok: true, data: { tweets: data, hot: Boolean(hot) } };
    },
  },

  tweets: {
    /**
     * POST /api/tweets/{id}/like -- write-through, returns the new count.
     *
     * `user_id` is required (422 without it) since likes became unique per user.
     * A repeat like comes back as 409, surfaced as error.kind === 'conflict':
     * not a failure, just a write that already happened.
     */
    async like(
      tweetId: number,
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<LikePayload>> {
      const res = await request<Partial<LikePayload>>(
        `/api/tweets/${tweetId}/like`,
        { ...options, method: 'POST', body: { user_id: userId } }
      );
      if (!res.ok) return res;

      if (typeof res.data.like_count !== 'number') {
        return {
          ok: false,
          error: apiError('corrupt', 'Like response carried no like_count'),
        };
      }

      return {
        ok: true,
        data: { tweet_id: tweetId, like_count: res.data.like_count },
      };
    },

    /** POST /api/tweets/{id}/like-buffered -- write-behind, Redis counter only. */
    async likeBuffered(
      tweetId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<BufferedLikePayload>> {
      const res = await request<Partial<BufferedLikePayload>>(
        `/api/tweets/${tweetId}/like-buffered`,
        { ...options, method: 'POST' }
      );
      if (!res.ok) return res;

      if (typeof res.data.buffered_likes !== 'number') {
        return {
          ok: false,
          error: apiError('corrupt', 'Buffered like response carried no buffered_likes'),
        };
      }

      return {
        ok: true,
        data: { tweet_id: tweetId, buffered_likes: res.data.buffered_likes },
      };
    },

    /**
     * GET /api/tweets/{id}/read-slow -- the lab 7 stale-write instrument. Sleeps
     * ~3s server-side, so it carries its own longer deadline.
     */
    readSlow(
      tweetId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<unknown>> {
      return request<unknown>(`/api/tweets/${tweetId}/read-slow`, {
        timeoutMs: 15000,
        ...options,
      });
    },
  },
};
