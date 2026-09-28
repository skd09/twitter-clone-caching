'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TweetCard from '@/components/TweetCard';
import RightRail from '@/components/RightRail';
import type { Tweet } from '@/lib/types';

const API = 'http://127.0.0.1:8000';
const VIEWER_ID = 2;

type Tab = 'following' | 'top';

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('following');

  // setState stays inside the promise callbacks. react-hooks/set-state-in-effect
  // rejects an effect body whose own call graph updates state synchronously,
  // which an awaited async function counts as.
  const load = useCallback(
    () =>
      fetch(`${API}/api/users/${VIEWER_ID}/timeline`)
        .then((res) => {
          if (!res.ok) throw new Error(`Timeline responded ${res.status}`);
          return res.json();
        })
        .then((data) => {
          // A cache hit can return a non-array payload when the backend caches
          // an object the cache store refuses to unserialize. Fail loudly here
          // rather than letting .map() blow up mid-render.
          if (!Array.isArray(data?.data)) {
            throw new Error(
              'Timeline returned an unexpected shape. Check the API cache payload.'
            );
          }
          setTweets(data.data);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(
            err instanceof Error ? err.message : 'Could not reach the API'
          );
        })
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setLoading(true);
    setError(null);
    load();
  }

  async function handleLike(tweetId: number) {
    setLiked((current) => new Set(current).add(tweetId));
    try {
      const res = await fetch(`${API}/api/tweets/${tweetId}/like`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Like responded ${res.status}`);
      const data = await res.json();

      setTweets((current) =>
        current.map((tweet) =>
          tweet.id === tweetId
            ? { ...tweet, like_count: data.like_count }
            : tweet
        )
      );
    } catch {
      // Roll the heart back so the UI never claims a like the API rejected.
      setLiked((current) => {
        const next = new Set(current);
        next.delete(tweetId);
        return next;
      });
    }
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

  return (
    <div className="mx-auto flex max-w-[1290px] justify-center">
      <Sidebar viewerId={VIEWER_ID} />

      <main className="w-full max-w-[600px] shrink-0 border-x border-line min-h-screen">
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-line">
          <h1 className="text-xl font-bold px-4 py-3">Home</h1>
          <div className="flex">
            <Tab
              label="Following"
              active={tab === 'following'}
              onClick={() => setTab('following')}
            />
            <Tab
              label="Top"
              active={tab === 'top'}
              onClick={() => setTab('top')}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-accent animate-spin" />
          </div>
        ) : error ? (
          <div className="px-8 py-10 text-center">
            <p className="text-[15px] text-muted">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-full px-5 py-2 text-[15px] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-8 py-10 text-center text-[15px] text-muted">
            {query ? `No posts matching “${query}”.` : 'No posts yet.'}
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

function Tab({
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
