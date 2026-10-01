'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Loader2, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TweetCard from '@/components/TweetCard';
import RightRail from '@/components/RightRail';
import StaleBanner from '@/components/StaleBanner';
import type { Tweet } from '@/lib/types';
import { api } from '@/lib/api';
import {
  readCachedTimeline,
  writeCachedTimeline,
} from '@/lib/timelineCache';

const VIEWER_ID = 2;
const RETRY_MS = 3000;

type Tab = 'following' | 'top';

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [hot, setHot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('following');

  // Every setState below sits inside a promise callback. fetchTimeline itself
  // touches no state, so the effect body's call graph stays update-free and
  // react-hooks/set-state-in-effect is satisfied.
  const load = useCallback(
    () =>
      api.timeline
        .get(VIEWER_ID)
        .then((result) => {
          if (result.ok) {
            setTweets(result.data.tweets);
            setHot(result.data.hot);
            setSavedAt(Date.now());
            setDegraded(false);
            setError(null);
            writeCachedTimeline(VIEWER_ID, result.data.tweets);
            return;
          }

          // Corrupt cache hit or a dead API: fall back to the last good copy
          // rather than throwing away a readable timeline.
          const cached = readCachedTimeline(VIEWER_ID);
          if (cached) {
            setTweets((current) =>
              current.length > 0 ? current : cached.tweets
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
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  // Only one request per TTL wins the cache miss and returns real rows, so keep
  // asking until we catch one.
  const needsRetry = degraded || error !== null;
  useEffect(() => {
    if (!needsRetry) return;
    const id = setInterval(load, RETRY_MS);
    return () => clearInterval(id);
  }, [needsRetry, load]);

  function handleLike(tweetId: number) {
    setLiked((current) => new Set(current).add(tweetId));

    api.tweets.like(tweetId, VIEWER_ID).then((result) => {
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

      setTweets((current) =>
        current.map((tweet) =>
          tweet.id === tweetId
            ? { ...tweet, like_count: result.data.like_count }
            : tweet
        )
      );
    });
  }

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
      <Sidebar viewerId={VIEWER_ID} />

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
                className={`w-[18px] h-[18px] ${
                  needsRetry ? 'animate-spin' : ''
                }`}
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

        {showingSaved && (
          <StaleBanner savedAt={savedAt} retrying={needsRetry} />
        )}

        {tweets.length === 0 ? (
          loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-7 h-7 text-accent animate-spin" />
            </div>
          ) : error ? (
            <Notice
              title="Can’t reach the timeline API"
              body={error}
              onRetry={load}
            />
          ) : degraded ? (
            <Notice
              title="Waiting for fresh data"
              body="The API is serving a corrupted cached response. Retrying every few seconds — real posts arrive on the next cache miss."
              onRetry={load}
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
          visible.map((tweet) => (
            <TweetCard
              key={tweet.id}
              tweet={tweet}
              liked={liked.has(tweet.id)}
              onLike={handleLike}
            />
          ))
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
