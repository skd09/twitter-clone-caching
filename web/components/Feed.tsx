'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Loader2, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TweetCard from '@/components/TweetCard';
import RightRail from '@/components/RightRail';
import StaleBanner from '@/components/StaleBanner';
import NewPostsPill from '@/components/NewPostsPill';
import ComposeBox from '@/components/ComposeBox';
import type { Tweet, Viewer } from '@/lib/types';
import { api, cursorFor } from '@/lib/api';
import { readCachedTimeline, writeCachedTimeline } from '@/lib/timelineCache';

const RETRY_MS = 3000;
const POLL_NEW_MS = 15000;

type Tab = 'following' | 'top';

/** Newest first, id breaking ties -- the same order the backend pages in. */
function sortFeed(tweets: Tweet[]): Tweet[] {
  return [...tweets].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return b.id - a.id;
  });
}

/** Incoming rows win on conflict, so refreshed counts replace stale ones. */
function mergeFeed(existing: Tweet[], incoming: Tweet[]): Tweet[] {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const tweet of incoming) byId.set(tweet.id, tweet);
  return sortFeed([...byId.values()]);
}

type Props = {
  /** Remount the component when this changes -- see app/page.tsx. */
  viewerId: number;
  signedInAs: Viewer;
  onLogout: () => void;
};

export default function Feed({ viewerId, signedInAs, onLogout }: Props) {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(signedInAs);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [reposted, setReposted] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [hot, setHot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('following');

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingNew, setPendingNew] = useState<Tweet[]>([]);

  const loadingMoreRef = useRef(false);
  // Mirrors `tweets` so the pagination and polling callbacks can read the
  // current feed without doing side effects inside a setState updater, which
  // React is free to invoke twice.
  const tweetsRef = useRef<Tweet[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Server engagement flags seed a tweet exactly once; local toggles win after.
  const seeded = useRef<Set<number>>(new Set());

  useEffect(() => {
    tweetsRef.current = tweets;
  }, [tweets]);

  const seedEngagement = useCallback((rows: Tweet[]) => {
    const fresh = rows.filter((t) => !seeded.current.has(t.id));
    if (fresh.length === 0) return;

    for (const t of fresh) seeded.current.add(t.id);

    const newlyLiked = fresh.filter((t) => t.liked_by_viewer).map((t) => t.id);
    const newlyReposted = fresh.filter((t) => t.reposted_by_viewer).map((t) => t.id);

    if (newlyLiked.length > 0) {
      setLiked((current) => new Set([...current, ...newlyLiked]));
    }
    if (newlyReposted.length > 0) {
      setReposted((current) => new Set([...current, ...newlyReposted]));
    }
  }, []);

  // setState stays inside promise callbacks: react-hooks/set-state-in-effect
  // rejects an effect body whose own call graph updates state synchronously.
  const load = useCallback(
    () =>
      api.timeline
        .get(viewerId)
        .then((result) => {
          if (result.ok) {
            const { tweets: fresh, viewer: who, hot: isHot } = result.data;
            seedEngagement(fresh);
            // Merge rather than replace: a refresh (or the 3s degraded retry)
            // must not discard pages already scrolled into view.
            setTweets((current) =>
              current.length === 0 ? sortFeed(fresh) : mergeFeed(current, fresh)
            );
            setHot(isHot);
            if (who) setViewer(who);
            setSavedAt(Date.now());
            setDegraded(false);
            setError(null);
            writeCachedTimeline(viewerId, fresh);
            return;
          }

          const cached = readCachedTimeline(viewerId);
          if (cached) {
            seedEngagement(cached.tweets);
            setTweets((current) =>
              current.length > 0 ? current : sortFeed(cached.tweets)
            );
            setSavedAt((current) => current ?? cached.savedAt);
          }

          if (result.error.kind === 'corrupt') {
            setDegraded(true);
            setError(null);
          } else {
            setError(result.error.message);
          }
        })
        .finally(() => setLoading(false)),
    [seedEngagement, viewerId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const needsRetry = degraded || error !== null;
  useEffect(() => {
    if (!needsRetry) return;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [needsRetry, load]);

  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  // --- infinite scroll -----------------------------------------------------

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;

    const current = tweetsRef.current;
    const oldest = current[current.length - 1];
    if (!oldest) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    api.timeline
      .before(viewerId, cursorFor(oldest))
      .then((result) => {
        if (!result.ok) {
          // A failed page is not fatal; the sentinel retries on the next scroll.
          return;
        }
        seedEngagement(result.data.tweets);
        if (result.data.tweets.length === 0) {
          setHasMore(false);
          return;
        }
        setTweets((latest) => mergeFeed(latest, result.data.tweets));
        setHasMore(result.data.hasMore);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [seedEngagement, viewerId]);

  useEffect(() => {
    const el = sentinelRef.current;
    // Searching filters the loaded rows client-side, so auto-paging while a
    // query is active would fetch pages the reader never asked for.
    if (!el || !hasMore || query.trim() !== '') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '600px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, query, loadMore]);

  // --- new posts -----------------------------------------------------------

  const pollNew = useCallback(() => {
    const newest = tweetsRef.current[0];
    if (!newest) return;

    api.timeline.after(viewerId, cursorFor(newest)).then((result) => {
      if (!result.ok || result.data.tweets.length === 0) return;
      seedEngagement(result.data.tweets);
      setPendingNew((waiting) => {
        const byId = new Map(waiting.map((t) => [t.id, t]));
        for (const t of result.data.tweets) byId.set(t.id, t);
        return sortFeed([...byId.values()]);
      });
    });
  }, [seedEngagement, viewerId]);

  useEffect(() => {
    const id = setInterval(pollNew, POLL_NEW_MS);
    return () => clearInterval(id);
  }, [pollNew]);

  function showNewPosts() {
    setTweets((current) => mergeFeed(current, pendingNew));
    setPendingNew([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- engagement ----------------------------------------------------------

  const patchTweet = useCallback((tweetId: number, patch: Partial<Tweet>) => {
    setTweets((current) =>
      current.map((tweet) =>
        tweet.id === tweetId ? { ...tweet, ...patch } : tweet
      )
    );
  }, []);

  function handleLike(tweetId: number) {
    setLiked((current) => new Set(current).add(tweetId));

    api.tweets.like(tweetId, viewerId).then((result) => {
      if (!result.ok) {
        // 409 means this user already liked it, so the filled heart is correct
        // and stays. Any other failure rolls back, so the UI never claims a like
        // the API rejected.
        if (result.error.kind !== 'conflict') {
          setLiked((current) => {
            const next = new Set(current);
            next.delete(tweetId);
            return next;
          });
        }
        return;
      }

      patchTweet(tweetId, { like_count: result.data.like_count });
    });
  }

  function handleRepost(tweetId: number, currentlyReposted: boolean) {
    setReposted((current) => {
      const next = new Set(current);
      if (currentlyReposted) next.delete(tweetId);
      else next.add(tweetId);
      return next;
    });

    const call = currentlyReposted
      ? api.tweets.unrepost(tweetId, viewerId)
      : api.tweets.repost(tweetId, viewerId);

    call.then((result) => {
      if (result.ok) {
        patchTweet(tweetId, { repost_count: result.data.repost_count });
        return;
      }

      // A 409 means the server is already in the state we were moving to
      // (already reposted / not reposted), so the optimistic flag stands.
      if (result.error.kind === 'conflict') return;

      setReposted((current) => {
        const next = new Set(current);
        if (currentlyReposted) next.add(tweetId);
        else next.delete(tweetId);
        return next;
      });
    });
  }

  function handleShare(tweetId: number) {
    api.tweets.share(tweetId).then((result) => {
      if (result.ok) patchTweet(tweetId, { share_count: result.data.share_count });
    });
  }

  const handleView = useCallback(
    (tweetId: number) => {
      api.tweets.view(tweetId, viewerId).then((result) => {
        if (result.ok) patchTweet(tweetId, { view_count: result.data.view_count });
      });
    },
    [patchTweet, viewerId]
  );

  function handlePost(body: string): Promise<boolean> {
    return api.tweets.create(viewerId, body).then((result) => {
      if (!result.ok) return false;

      // The endpoint returns ids only, not the created row, and the author's own
      // posts are not in their own timeline (nobody follows themselves), so the
      // card is composed locally and prepended.
      const author = viewer ?? signedInAs;
      const optimistic: Tweet = {
        id: result.data.tweet_id,
        user_id: viewerId,
        author_name: author.name,
        author_handle: author.username,
        body,
        like_count: 0,
        repost_count: 0,
        reply_count: 0,
        view_count: 0,
        share_count: 0,
        liked_by_viewer: false,
        reposted_by_viewer: false,
        // Backend stores UTC as "Y-m-d H:i:s"; match it so relative time agrees.
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      // Already known locally, so the server flags must not re-seed it later.
      seeded.current.add(optimistic.id);
      setTweets((current) => mergeFeed(current, [optimistic]));
      return true;
    });
  }

  function handleReply(tweetId: number, body: string): Promise<boolean> {
    return api.tweets.reply(tweetId, viewerId, body).then((result) => {
      if (!result.ok) return false;
      patchTweet(tweetId, { reply_count: result.data.reply_count });
      return true;
    });
  }

  // --- render --------------------------------------------------------------

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tweets.filter((tweet) => tweet.body.toLowerCase().includes(needle))
      : tweets;

    return tab === 'top'
      ? [...filtered].sort((a, b) => b.like_count - a.like_count)
      : filtered;
  }, [tweets, query, tab]);

  const showingSaved = needsRetry && tweets.length > 0;

  return (
    <div className="mx-auto flex max-w-[1290px] justify-center">
      <Sidebar viewerId={viewerId} viewer={viewer} onLogout={onLogout} />

      <main className="w-full max-w-[600px] shrink-0 border-x border-line min-h-screen">
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-line">
          <div className="flex items-center gap-2 px-4 py-3">
            <h1 className="text-xl font-bold">Home</h1>
            {hot && (
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-like bg-like-soft rounded-full px-2 py-0.5">
                <Flame className="w-3 h-3" fill="currentColor" />
                Hot key
              </span>
            )}
            <button
              type="button"
              onClick={load}
              aria-label="Refresh timeline"
              className="ml-auto -mr-2 p-2 rounded-full text-muted hover:text-accent hover:bg-accent-soft transition-colors"
            >
              <RefreshCw
                className={`w-[18px] h-[18px] ${needsRetry ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
          <div className="flex">
            <TabButton
              label="Following"
              active={tab === 'following'}
              onClick={() => setTab('following')}
            />
            <TabButton
              label="Top"
              active={tab === 'top'}
              onClick={() => setTab('top')}
            />
          </div>
        </div>

        <ComposeBox author={viewer ?? signedInAs} onPost={handlePost} />

        <NewPostsPill count={pendingNew.length} onClick={showNewPosts} />

        {showingSaved && <StaleBanner savedAt={savedAt} retrying={needsRetry} />}

        {tweets.length === 0 ? (
          loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-7 h-7 text-accent animate-spin" />
            </div>
          ) : error ? (
            <Notice
              title="Can’t reach the timeline API"
              body={error}
              onRetry={retry}
            />
          ) : degraded ? (
            <Notice
              title="Waiting for fresh data"
              body="The API is serving a corrupted cached response. Retrying every few seconds — real posts arrive on the next cache miss."
              onRetry={retry}
              busy
            />
          ) : (
            <p className="px-8 py-10 text-center text-[15px] text-muted">
              No posts yet.
            </p>
          )
        ) : visible.length === 0 ? (
          <p className="px-8 py-10 text-center text-[15px] text-muted">
            No posts matching “{query}”.
          </p>
        ) : (
          <>
            {visible.map((tweet) => (
              <TweetCard
                key={tweet.id}
                tweet={tweet}
                liked={liked.has(tweet.id)}
                reposted={reposted.has(tweet.id)}
                onLike={handleLike}
                onRepost={handleRepost}
                onShare={handleShare}
                onView={handleView}
                onReply={handleReply}
              />
            ))}

            <div ref={sentinelRef} aria-hidden className="h-px" />

            {query.trim() === '' && (
              <div className="py-8 flex justify-center">
                {loadingMore ? (
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                ) : hasMore ? (
                  <button
                    type="button"
                    onClick={loadMore}
                    className="text-accent hover:underline text-[15px]"
                  >
                    Load more
                  </button>
                ) : (
                  <p className="text-[15px] text-muted">
                    You’re all caught up.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <RightRail query={query} onQueryChange={setQuery} tweets={tweets} />
    </div>
  );
}

function Notice({
  title,
  body,
  onRetry,
  busy,
}: {
  title: string;
  body: string;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="px-8 py-10 text-center">
      {busy && (
        <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
      )}
      <p className="text-[17px] font-bold">{title}</p>
      <p className="text-[15px] text-muted mt-1 leading-5">{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-full px-5 py-2 text-[15px] transition-colors"
      >
        Retry now
      </button>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 hover:bg-hover transition-colors"
    >
      <span
        className={`inline-flex h-[53px] items-center px-4 border-b-4 ${
          active
            ? 'border-accent font-bold'
            : 'border-transparent text-muted font-medium'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
