export type Tweet = {
  id: number;
  user_id: number;
  body: string;
  author_name: string;
  author_handle: string;
  /** Whether the requesting viewer has already liked / reposted this tweet. */
  liked_by_viewer: boolean;
  reposted_by_viewer: boolean;
  like_count: number;
  repost_count: number;
  reply_count: number;
  view_count: number;
  share_count: number;
  created_at: string;
};

function hasCoreFields(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'number' &&
    typeof t.user_id === 'number' &&
    typeof t.body === 'string' &&
    typeof t.created_at === 'string'
  );
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The repost/reply/view/share columns were added after the first rows were
 * cached, so they are defaulted rather than required: a payload written by the
 * older shape (a stale localStorage copy, say) still parses instead of being
 * thrown out as corrupt.
 */
export function toTweet(value: unknown): Tweet | null {
  if (!hasCoreFields(value)) return null;
  const t = value as Record<string, unknown>;

  const tweetId = t.id as number;
  const authorId = t.user_id as number;

  return {
    id: tweetId,
    user_id: authorId,
    body: t.body as string,
    created_at: t.created_at as string,
    // The API joins users for these; the id-derived fallback keeps older cached
    // payloads (written before the join existed) renderable.
    author_name: text(t.author_name) ?? `User ${authorId}`,
    author_handle: (text(t.author_handle) ?? `user${authorId}`).replace(/^@/, ''),
    liked_by_viewer: t.liked_by_viewer === true,
    reposted_by_viewer: t.reposted_by_viewer === true,
    like_count: count(t.like_count),
    repost_count: count(t.repost_count),
    reply_count: count(t.reply_count),
    view_count: count(t.view_count),
    share_count: count(t.share_count),
  };
}

export type Viewer = { id: number; name: string; username: string };

export function toViewer(value: unknown): Viewer | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'number') return null;
  const name = text(v.name);
  const username = text(v.username);
  if (name === null || username === null) return null;
  return { id: v.id, name, username: username.replace(/^@/, '') };
}

/** All-or-nothing: one unparseable row invalidates the batch. */
export function toTweets(value: unknown): Tweet[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(toTweet);
  return parsed.every((t): t is Tweet => t !== null) ? parsed : null;
}
