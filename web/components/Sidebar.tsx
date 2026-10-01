import {
  Bell,
  Bookmark,
  Home,
  Mail,
  LogOut,
  MoreHorizontal,
  Search,
  User,
  Zap,
} from 'lucide-react';
import { avatarTint, displayName, handle, initials, initialsFromName } from '@/lib/format';
import type { Viewer } from '@/lib/types';

const NAV = [
  { label: 'Home', icon: Home, active: true },
  { label: 'Explore', icon: Search, active: false },
  { label: 'Notifications', icon: Bell, active: false },
  { label: 'Messages', icon: Mail, active: false },
  { label: 'Bookmarks', icon: Bookmark, active: false },
  { label: 'Profile', icon: User, active: false },
  { label: 'More', icon: MoreHorizontal, active: false },
];

export default function Sidebar({
  viewerId,
  viewer,
  onLogout,
}: {
  viewerId: number;
  viewer: Viewer | null;
  onLogout: () => void;
}) {
  // Falls back to the id-derived label until the timeline response arrives.
  const name = viewer?.name ?? displayName(viewerId);
  const atHandle = viewer ? `@${viewer.username}` : handle(viewerId);
  const avatar = viewer ? initialsFromName(viewer.name) : initials(viewerId);

  return (
    <header className="sticky top-0 h-screen shrink-0 w-[88px] xl:w-[275px] flex flex-col items-center xl:items-stretch px-1 xl:px-2 py-1">
      <a
        href="#"
        aria-label="Pulse home"
        className="w-[52px] h-[52px] shrink-0 flex items-center justify-center rounded-full hover:bg-hover transition-colors xl:ml-1"
      >
        <Zap className="w-8 h-8 text-accent" fill="currentColor" strokeWidth={1.5} />
      </a>

      <nav className="flex flex-col gap-0.5 mt-0.5">
        {NAV.map(({ label, icon: Icon, active }) => (
          <a
            key={label}
            href="#"
            className="group flex items-center justify-center xl:justify-start"
          >
            <span className="flex items-center gap-5 px-3 py-3 rounded-full group-hover:bg-hover transition-colors">
              <Icon
                className="w-[26px] h-[26px] shrink-0"
                strokeWidth={active ? 2.25 : 1.75}
                {...(active ? { fill: 'currentColor' } : {})}
              />
              <span
                className={`hidden xl:inline text-xl pr-4 ${
                  active ? 'font-bold' : 'font-normal'
                }`}
              >
                {label}
              </span>
            </span>
          </a>
        ))}
      </nav>

      <button
        type="button"
        className="mt-4 bg-accent hover:bg-accent-hover text-white font-bold transition-colors rounded-full w-[52px] h-[52px] xl:w-full xl:h-[52px] flex items-center justify-center text-[17px]"
      >
        <span className="hidden xl:inline">Post</span>
        <Zap className="xl:hidden w-6 h-6" fill="currentColor" strokeWidth={1.5} />
      </button>

      <div className="mt-auto mb-3 w-full">
        <button
          type="button"
          onClick={onLogout}
          title="Sign out"
          aria-label={`Signed in as ${name}. Sign out.`}
          className="w-full flex items-center gap-3 p-3 rounded-full hover:bg-hover transition-colors"
        >
          <span
            className={`w-10 h-10 shrink-0 rounded-full ${avatarTint(
              viewerId
            )} text-white flex items-center justify-center font-bold text-sm`}
          >
            {avatar}
          </span>
          <span className="hidden xl:flex flex-col items-start min-w-0 leading-tight">
            <span className="font-bold text-[15px] truncate max-w-[140px]">
              {name}
            </span>
            <span className="text-muted text-[15px] truncate max-w-[140px]">
              {atHandle}
            </span>
          </span>
          <LogOut className="hidden xl:block w-[18px] h-[18px] ml-auto shrink-0" />
        </button>
      </div>
    </header>
  );
}
