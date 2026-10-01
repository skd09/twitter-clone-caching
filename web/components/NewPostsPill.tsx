'use client';

import { ArrowUp } from 'lucide-react';

export default function NewPostsPill({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div className="sticky top-[106px] z-20 flex justify-center pointer-events-none">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto -mb-10 mt-2 flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-bold text-[14px] rounded-full pl-3 pr-4 py-2 shadow-lg transition-colors"
      >
        <ArrowUp className="w-4 h-4" />
        {count === 1 ? 'Show 1 new post' : `Show ${count} new posts`}
      </button>
    </div>
  );
}
