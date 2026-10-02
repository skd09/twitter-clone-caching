'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { avatarTint, initialsFromName } from '@/lib/format';
import type { Viewer } from '@/lib/types';

const MAX = 200;

export default function ComposeBox({
  author,
  onPost,
}: {
  author: Viewer;
  onPost: (body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const remaining = MAX - draft.length;

  function submit() {
    if (trimmed === '' || sending) return;

    setSending(true);
    setError(null);

    onPost(trimmed)
      .then((posted) => {
        if (posted) setDraft('');
        else setError('Could not post. Try again.');
      })
      .finally(() => setSending(false));
  }

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-line">
      <div
        className={`w-10 h-10 shrink-0 rounded-full ${avatarTint(
          author.id
        )} text-white flex items-center justify-center font-bold text-sm`}
      >
        {initialsFromName(author.name)}
      </div>

      <div className="flex-1 min-w-0">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX))}
          onKeyDown={(event) => {
            // Twitter posts on Cmd/Ctrl+Enter.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
          }}
          placeholder="What's happening?"
          aria-label="Write a post"
          rows={2}
          className="w-full bg-transparent text-[19px] placeholder:text-muted outline-none resize-none py-2"
        />

        {error && (
          <p role="alert" className="text-[13px] text-like leading-5 mb-1">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-line pt-2">
          <span
            className={`text-[13px] tabular-nums ${
              remaining <= 20 ? 'text-like' : 'text-muted'
            }`}
          >
            {remaining}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={trimmed === '' || sending}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full px-5 py-2 text-[15px] transition-colors"
          >
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
