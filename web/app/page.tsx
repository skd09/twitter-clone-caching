'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Feed from '@/components/Feed';
import LoginScreen from '@/components/LoginScreen';
import { clearSession, readSession, writeSession } from '@/lib/session';
import type { Viewer } from '@/lib/types';

export default function Home() {
  const [session, setSession] = useState<Viewer | null>(null);
  const [checked, setChecked] = useState(false);

  // localStorage is read in an effect, never during render: the page is
  // prerendered on the server where window does not exist.
  useEffect(() => {
    Promise.resolve(readSession()).then((found) => {
      setSession(found);
      setChecked(true);
    });
  }, []);

  const signIn = useCallback((viewer: Viewer) => {
    writeSession(viewer);
    setSession(viewer);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-accent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onSignedIn={signIn} />;
  }

  // `key` is load-bearing. Switching accounts must not inherit the previous
  // user's tweets, liked/reposted sets, pagination cursor or seeded-engagement
  // ref. Remounting on viewer id guarantees a clean slate rather than relying on
  // remembering to reset every piece of state by hand.
  return (
    <Feed
      key={session.id}
      viewerId={session.id}
      signedInAs={session}
      onLogout={signOut}
    />
  );
}
