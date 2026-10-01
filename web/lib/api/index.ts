/**
 * The gateway surface. Every backend route the app uses is declared here once,
 * with its response validated before it reaches a component.
 *
 * Routes mirror app/routes/api.php.
 */

import { toTweet, toTweets, toViewer, type Tweet, type Viewer } from '@/lib/types';
import { apiError, request, type ApiResult, type RequestOptions } from './client';

export type { ApiError, ApiErrorKind, ApiResult } from './client';
export { API_BASE_URL } from './client';

export type TimelinePayload = {
  tweets: Tweet[];
  /** HotKeyDetector verdict from the lab 7 controller. */
  hot: boolean;
  /** Which Redis instance served it, from the lab 8 hot/cold split. */
  redis: string | null;
  /** The signed-in user's profile, cache-aside on the backend. */
  viewer: Viewer | null;
  /** Keyset cursor for the next (older) page; null when the page was empty. */
  nextCursor: string | null;
  hasMore: boolean;
};

/** Cursor format is `base64("<created_at>|<id>")`, matching the backend. */
export function cursorFor(tweet: Tweet): string {
  return btoa(`${tweet.created_at}|${tweet.id}`);
}

export type LikePayload = { tweet_id: number; like_count: number };
export type RepostPayload = {
  tweet_id: number;
  repost_count: number;
  reposted: boolean;
};
export type ReplyPayload = {
  tweet_id: number;
  reply_count: number;
  reply: Tweet | null;
};
export type ViewPayload = {
  tweet_id: number;
  view_count: number;
  buffered: number;
  /** False when the backend recognised this viewer had already seen the post. */
  counted: boolean;
};
export type SharePayload = { tweet_id: number; share_count: number; buffered: number };
export type BufferedLikePayload = { tweet_id: number; buffered_likes: number };

async function fetchTimelinePage(
  path: string,
  options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
): Promise<ApiResult<TimelinePayload>> {
  const res = await request<{
    data?: unknown;
    hot?: unknown;
    redis?: unknown;
    viewer?: unknown;
    next_cursor?: unknown;
    has_more?: unknown;
  }>(path, options);
  if (!res.ok) return res;

  const { data, hot, redis, viewer, next_cursor, has_more } = res.data;
  const tweets = toTweets(data);
  if (tweets === null) {
    return {
      ok: false,
      error: apiError(
        'corrupt',
        'Timeline returned a cached payload with no usable rows'
      ),
    };
  }

  return {
    ok: true,
    data: {
      tweets,
      hot: Boolean(hot),
      redis: typeof redis === 'string' ? redis : null,
      viewer: toViewer(viewer),
      nextCursor: typeof next_cursor === 'string' ? next_cursor : null,
      hasMore: Boolean(has_more),
    },
  };
}

export const api = {
  auth: {
    /**
     * Demo sign-in. The password is sent for form realism and ignored by the
     * backend -- this is not authentication.
     */
    async login(
      username: string,
      password: string,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<Viewer>> {
      const res = await request<{ user?: unknown }>('/api/auth/login', {
        ...options,
        method: 'POST',
        body: { username, password },
      });
      if (!res.ok) return res;

      const user = toViewer(res.data.user);
      if (user === null) {
        return { ok: false, error: apiError('corrupt', 'Login returned no user') };
      }
      return { ok: true, data: user };
    },

    async suggestions(
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<Viewer[]>> {
      const res = await request<{ suggestions?: unknown }>('/api/auth/suggestions', options);
      if (!res.ok) return res;

      const list = Array.isArray(res.data.suggestions)
        ? res.data.suggestions.map(toViewer).filter((v): v is Viewer => v !== null)
        : [];
      return { ok: true, data: list };
    },
  },

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
    get(
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<TimelinePayload>> {
      return fetchTimelinePage(`/api/users/${userId}/timeline`, options);
    },

    /** Older page, walking backwards from a cursor. Uncached on the backend. */
    before(
      userId: number,
      cursor: string,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<TimelinePayload>> {
      return fetchTimelinePage(
        `/api/users/${userId}/timeline?before=${encodeURIComponent(cursor)}`,
        options
      );
    },

    /** Anything newer than the cursor -- the "N new posts" poll. */
    after(
      userId: number,
      cursor: string,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<TimelinePayload>> {
      return fetchTimelinePage(
        `/api/users/${userId}/timeline?after=${encodeURIComponent(cursor)}`,
        options
      );
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

    /**
     * POST /api/tweets/{id}/repost -- write-through, unique per user.
     * A repeat is 409 -> error.kind === 'conflict', same contract as like().
     */
    async repost(
      tweetId: number,
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<RepostPayload>> {
      const res = await request<Partial<RepostPayload>>(
        `/api/tweets/${tweetId}/repost`,
        { ...options, method: 'POST', body: { user_id: userId } }
      );
      if (!res.ok) return res;
      if (typeof res.data.repost_count !== 'number') {
        return { ok: false, error: apiError('corrupt', 'Repost response carried no repost_count') };
      }
      return {
        ok: true,
        data: { tweet_id: tweetId, repost_count: res.data.repost_count, reposted: true },
      };
    },

    /** DELETE /api/tweets/{id}/repost -- undo. 409 when there was nothing to undo. */
    async unrepost(
      tweetId: number,
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<RepostPayload>> {
      const res = await request<Partial<RepostPayload>>(
        `/api/tweets/${tweetId}/repost`,
        { ...options, method: 'DELETE', body: { user_id: userId } }
      );
      if (!res.ok) return res;
      if (typeof res.data.repost_count !== 'number') {
        return { ok: false, error: apiError('corrupt', 'Unrepost response carried no repost_count') };
      }
      return {
        ok: true,
        data: { tweet_id: tweetId, repost_count: res.data.repost_count, reposted: false },
      };
    },

    /** POST /api/tweets/{id}/reply -- write-through; creates a child tweet. */
    async reply(
      tweetId: number,
      userId: number,
      body: string,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<ReplyPayload>> {
      const res = await request<{ reply_count?: unknown; reply?: unknown }>(
        `/api/tweets/${tweetId}/reply`,
        { ...options, method: 'POST', body: { user_id: userId, body } }
      );
      if (!res.ok) return res;
      if (typeof res.data.reply_count !== 'number') {
        return { ok: false, error: apiError('corrupt', 'Reply response carried no reply_count') };
      }
      return {
        ok: true,
        data: {
          tweet_id: tweetId,
          reply_count: res.data.reply_count,
          reply: toTweet(res.data.reply),
        },
      };
    },

    /**
     * POST /api/tweets/{id}/view -- write-behind. The returned count already
     * includes the unflushed Redis buffer, so it never reads lower than the last
     * value the caller saw.
     */
    async view(
      tweetId: number,
      userId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<ViewPayload>> {
      const res = await request<Partial<ViewPayload>>(`/api/tweets/${tweetId}/view`, {
        ...options,
        method: 'POST',
        body: { user_id: userId },
      });
      if (!res.ok) return res;
      if (typeof res.data.view_count !== 'number') {
        return { ok: false, error: apiError('corrupt', 'View response carried no view_count') };
      }
      return {
        ok: true,
        data: {
          tweet_id: tweetId,
          view_count: res.data.view_count,
          buffered: typeof res.data.buffered === 'number' ? res.data.buffered : 0,
          counted: res.data.counted === true,
        },
      };
    },

    /** POST /api/tweets/{id}/share -- write-behind, same shape as view(). */
    async share(
      tweetId: number,
      options?: Pick<RequestOptions, 'signal' | 'timeoutMs'>
    ): Promise<ApiResult<SharePayload>> {
      const res = await request<Partial<SharePayload>>(`/api/tweets/${tweetId}/share`, {
        ...options,
        method: 'POST',
      });
      if (!res.ok) return res;
      if (typeof res.data.share_count !== 'number') {
        return { ok: false, error: apiError('corrupt', 'Share response carried no share_count') };
      }
      return {
        ok: true,
        data: {
          tweet_id: tweetId,
          share_count: res.data.share_count,
          buffered: typeof res.data.buffered === 'number' ? res.data.buffered : 0,
        },
      };
    },
  },
};
