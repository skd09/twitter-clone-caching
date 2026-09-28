'use client';

import {
  BarChart2,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share,
} from 'lucide-react';
import type { Tweet } from '@/lib/types';
import {
  avatarTint,
  compactCount,
  displayName,
  handle,
  initials,
  relativeTime,
} from '@/lib/format';

type Props = {
  tweet: Tweet;
  liked: boolean;
  onLike: (tweetId: number) => void;
};

export default function TweetCard({ tweet, liked, onLike }: Props) {
  return (
    <article className="flex gap-3 px-4 py-3 border-b border-line hover:bg-hover transition-colors cursor-pointer">
      <div
        className={`w-10 h-10 shrink-0 rounded-full ${avatarTint(
          tweet.user_id
        )} text-white flex items-center justify-center font-bold text-sm`}
      >
        {initials(tweet.user_id)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[15px] leading-5">
          <span className="font-bold hover:underline truncate">
            {displayName(tweet.user_id)}
          </span>
          <span className="text-muted truncate">{handle(tweet.user_id)}</span>
          <span className="text-muted">·</span>
          <time
            dateTime={tweet.created_at}
            title={new Date(tweet.created_at).toLocaleString()}
            className="text-muted hover:underline shrink-0"
          >
            {relativeTime(tweet.created_at)}
          </time>
          <button
            type="button"
            aria-label="More"
            className="ml-auto -mr-2 shrink-0 p-2 rounded-full text-muted hover:text-accent hover:bg-accent-soft transition-colors"
          >
            <MoreHorizontal className="w-[18px] h-[18px]" />
          </button>
        </div>

        <p className="text-[15px] leading-5 whitespace-pre-wrap break-words mt-0.5">
          {tweet.body}
        </p>

        {/* Twitter renders these four evenly across the card width, and shows no
            number at all when a count is zero. Reply / repost / views have no
            backing column in the tweets table, so they stay countless. */}
        <div className="flex items-center justify-between max-w-[425px] mt-3 -ml-2 text-muted">
          <Action
            icon={<MessageCircle className="w-[18px] h-[18px]" />}
            label="Reply"
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
          />
          <Action
            icon={<Repeat2 className="w-[19px] h-[19px]" />}
            label="Repost"
            hover="group-hover:text-repost"
            hoverBg="group-hover:bg-repost-soft"
          />
          <Action
            icon={
              <Heart
                className="w-[18px] h-[18px]"
                {...(liked ? { fill: 'currentColor' } : {})}
              />
            }
            label="Like"
            count={tweet.like_count}
            active={liked}
            activeColor="text-like"
            hover="group-hover:text-like"
            hoverBg="group-hover:bg-like-soft"
            onClick={() => onLike(tweet.id)}
          />
          <Action
            icon={<BarChart2 className="w-[18px] h-[18px]" />}
            label="Views"
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
          />
          <Action
            icon={<Share className="w-[18px] h-[18px]" />}
            label="Share"
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
          />
        </div>
      </div>
    </article>
  );
}

type ActionProps = {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  hover: string;
  hoverBg: string;
  onClick?: () => void;
};

function Action({
  icon,
  label,
  count,
  active,
  activeColor,
  hover,
  hoverBg,
  onClick,
}: ActionProps) {
  const rendered = count === undefined ? '' : compactCount(count);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className={`group flex items-center gap-1 transition-colors ${
        active && activeColor ? activeColor : ''
      } ${hover}`}
    >
      <span className={`p-2 rounded-full transition-colors ${hoverBg}`}>
        {icon}
      </span>
      <span className="text-[13px] tabular-nums -ml-1 min-w-[1ch] text-left">
        {rendered}
      </span>
    </button>
  );
}
