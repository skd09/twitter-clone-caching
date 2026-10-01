'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Check,
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share,
} from 'lucide-react';
import type { Tweet } from '@/lib/types';
import {
  avatarTint,
  compactCount,
  initialsFromName,
  parseApiDate,
  relativeTime,
} from '@/lib/format';

type Props = {
  tweet: Tweet;
  liked: boolean;
  reposted: boolean;
  onLike: (tweetId: number) => void;
  onRepost: (tweetId: number, currentlyReposted: boolean) => void;
  onShare: (tweetId: number) => void;
  onView: (tweetId: number) => void;
  onReply: (tweetId: number, body: string) => Promise<boolean>;
};

const REPLY_MAX = 200;

export default function TweetCard({
  tweet,
  liked,
  reposted,
  onLike,
  onRepost,
  onShare,
  onView,
  onReply,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const counted = useRef(false);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // A view is an impression, so it fires when the card actually reaches the
  // viewport -- once per card, never on mount for rows the reader scrolled past.
  useEffect(() => {
    const el = articleRef.current;
    if (!el || counted.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !counted.current) {
            counted.current = true;
            onView(tweet.id);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [tweet.id, onView]);

  function handleShare() {
    const url = `${window.location.origin}/tweet/${tweet.id}`;
    navigator.clipboard?.writeText(url).catch(() => {
      // Clipboard can be blocked; the share is still worth recording.
    });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onShare(tweet.id);
  }

  function submitReply() {
    const body = draft.trim();
    if (body === '' || sending) return;

    setSending(true);
    onReply(tweet.id, body)
      .then((sent) => {
        if (sent) {
          setDraft('');
          setComposing(false);
        }
      })
      .finally(() => setSending(false));
  }

  return (
    <article
      ref={articleRef}
      className="flex gap-3 px-4 py-3 border-b border-line hover:bg-hover transition-colors"
    >
      <div
        className={`w-10 h-10 shrink-0 rounded-full ${avatarTint(
          tweet.user_id
        )} text-white flex items-center justify-center font-bold text-sm`}
      >
        {initialsFromName(tweet.author_name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[15px] leading-5">
          <span className="font-bold hover:underline truncate">
            {tweet.author_name}
          </span>
          <span className="text-muted truncate">@{tweet.author_handle}</span>
          <span className="text-muted">·</span>
          <time
            dateTime={parseApiDate(tweet.created_at).toISOString()}
            title={parseApiDate(tweet.created_at).toLocaleString()}
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

        {/* Twitter shows no number at zero, and never a share count. */}
        <div className="flex items-center justify-between max-w-[425px] mt-3 -ml-2 text-muted">
          <Action
            icon={<MessageCircle className="w-[18px] h-[18px]" />}
            label="Reply"
            count={tweet.reply_count}
            active={composing}
            activeColor="text-accent"
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
            onClick={() => setComposing((open) => !open)}
          />
          <Action
            icon={
              <Repeat2
                className="w-[19px] h-[19px]"
                strokeWidth={reposted ? 2.5 : 2}
              />
            }
            label={reposted ? 'Undo repost' : 'Repost'}
            count={tweet.repost_count}
            active={reposted}
            activeColor="text-repost"
            hover="group-hover:text-repost"
            hoverBg="group-hover:bg-repost-soft"
            onClick={() => onRepost(tweet.id, reposted)}
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
            count={tweet.view_count}
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
          />
          <Action
            icon={
              copied ? (
                <Check className="w-[18px] h-[18px]" />
              ) : (
                <Share className="w-[18px] h-[18px]" />
              )
            }
            label={copied ? 'Link copied' : 'Share'}
            active={copied}
            activeColor="text-accent"
            hover="group-hover:text-accent"
            hoverBg="group-hover:bg-accent-soft"
            onClick={handleShare}
          />
        </div>

        {composing && (
          <div className="mt-3 border-t border-line pt-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, REPLY_MAX))}
              placeholder="Post your reply"
              rows={2}
              autoFocus
              className="w-full bg-transparent text-[15px] placeholder:text-muted outline-none resize-none"
            />
            <div className="flex items-center justify-end gap-3 mt-1">
              <span
                className={`text-[13px] tabular-nums ${
                  draft.length >= REPLY_MAX ? 'text-like' : 'text-muted'
                }`}
              >
                {draft.length}/{REPLY_MAX}
              </span>
              <button
                type="button"
                onClick={submitReply}
                disabled={draft.trim() === '' || sending}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full px-4 py-1.5 text-[14px] transition-colors"
              >
                {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Reply
              </button>
            </div>
          </div>
        )}
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
      title={label}
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
