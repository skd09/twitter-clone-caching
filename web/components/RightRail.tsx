'use client';

import { Search } from 'lucide-react';
import type { Tweet } from '@/lib/types';
import { compactCount, displayName } from '@/lib/format';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  tweets: Tweet[];
};

export default function RightRail({ query, onQueryChange, tweets }: Props) {
  // Twitter fills this rail with trends. We have no trends endpoint, so this is
  // the real thing we do have: the most-liked tweets currently in the timeline.
  const top = [...tweets]
    .sort((a, b) => b.like_count - a.like_count)
    .filter((tweet) => tweet.like_count > 0)
    .slice(0, 5);

  return (
    <aside className="hidden lg:block w-[350px] shrink-0 px-8 py-1">
      <div className="sticky top-0 pb-3 bg-background">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search Pulse"
            aria-label="Search posts"
            className="w-full bg-elevated rounded-full pl-12 pr-4 py-3 text-[15px] placeholder:text-muted outline-none border border-transparent focus:border-accent focus:bg-background transition-colors"
          />
        </label>
      </div>

      <section className="bg-elevated rounded-2xl overflow-hidden">
        <h2 className="text-xl font-extrabold px-4 pt-3 pb-2">
          Most liked right now
        </h2>
        {top.length === 0 ? (
          <p className="px-4 pb-4 text-[15px] text-muted">
            Nothing liked yet. Tap a heart to get things moving.
          </p>
        ) : (
          top.map((tweet, index) => (
            <a
              key={tweet.id}
              href="#"
              className="block px-4 py-3 hover:bg-hover transition-colors"
            >
              <p className="text-[13px] text-muted">
                {index + 1} · {displayName(tweet.user_id)}
              </p>
              <p className="text-[15px] font-bold leading-5 line-clamp-2 mt-0.5">
                {tweet.body}
              </p>
              <p className="text-[13px] text-muted mt-0.5">
                {compactCount(tweet.like_count)} likes
              </p>
            </a>
          ))
        )}
      </section>

      <p className="text-[13px] text-muted px-4 mt-4 leading-5">
        Pulse — a caching playground. Timeline reads are served cache-aside from
        Redis; likes are write-through.
      </p>
    </aside>
  );
}
