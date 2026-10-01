'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { avatarTint, initialsFromName } from '@/lib/format';
import type { Viewer } from '@/lib/types';

export default function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: (viewer: Viewer) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Viewer[]>([]);

  const loadSuggestions = useCallback(
    () =>
      api.auth.suggestions().then((result) => {
        if (result.ok) setSuggestions(result.data);
      }),
    []
  );

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const signIn = useCallback(
    (handle: string) => {
      const trimmed = handle.trim();
      if (trimmed === '' || busy) return;

      setBusy(true);
      setError(null);

      api.auth
        .login(trimmed, password)
        .then((result) => {
          if (result.ok) {
            onSignedIn(result.data);
            return;
          }
          setError(result.error.message);
        })
        .finally(() => setBusy(false));
    },
    [busy, password, onSignedIn]
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <Zap className="w-10 h-10 text-accent mb-6" fill="currentColor" strokeWidth={1.5} />

        <h1 className="text-[31px] leading-9 font-extrabold tracking-tight">
          Sign in to Pulse
        </h1>
        <p className="text-[15px] text-muted mt-2 leading-5">
          Any seeded username works and the password is ignored — this is a demo
          with no real authentication.
        </p>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            signIn(username);
          }}
        >
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username, e.g. miahart2"
            aria-label="Username"
            autoFocus
            autoComplete="username"
            className="w-full bg-transparent border border-line rounded-md px-3 py-3 text-[17px] placeholder:text-muted outline-none focus:border-accent transition-colors"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password (ignored)"
            aria-label="Password, ignored"
            autoComplete="current-password"
            className="w-full bg-transparent border border-line rounded-md px-3 py-3 text-[17px] placeholder:text-muted outline-none focus:border-accent transition-colors"
          />

          {error && (
            <p role="alert" className="text-[14px] text-like leading-5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={username.trim() === '' || busy}
            className="mt-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full py-3 text-[15px] transition-colors"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="mt-8">
            <p className="text-[13px] text-muted mb-2">Or pick an account:</p>
            <div className="flex flex-col">
              {suggestions.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setUsername(user.username);
                    signIn(user.username);
                  }}
                  disabled={busy}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-hover disabled:opacity-50 transition-colors text-left"
                >
                  <span
                    className={`w-9 h-9 shrink-0 rounded-full ${avatarTint(
                      user.id
                    )} text-white flex items-center justify-center font-bold text-[13px]`}
                  >
                    {initialsFromName(user.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold truncate">
                      {user.name}
                    </span>
                    <span className="block text-[13px] text-muted truncate">
                      @{user.username}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
