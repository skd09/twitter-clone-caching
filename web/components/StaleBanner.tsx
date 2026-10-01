'use client';

import { Loader2, TriangleAlert } from 'lucide-react';

type Props = {
  savedAt: number | null;
  retrying: boolean;
};

export default function StaleBanner({ savedAt, retrying }: Props) {
  const stamp =
    savedAt === null
      ? null
      : new Date(savedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-line bg-elevated">
      <TriangleAlert className="w-[18px] h-[18px] shrink-0 mt-0.5 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-5">
          Showing a saved copy{stamp ? ` from ${stamp}` : ''}
        </p>
        <p className="text-[13px] text-muted leading-5 mt-0.5">
          The API returned a corrupted cached payload, so these posts may be out
          of date. Live data returns on the next cache miss.
        </p>
      </div>
      {retrying && (
        <Loader2 className="w-4 h-4 shrink-0 mt-1 text-muted animate-spin" />
      )}
    </div>
  );
}
