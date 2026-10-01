/**
 * Who the app is currently acting as.
 *
 * Browser-local only -- there is no token and no server session. Everything
 * per-user is keyed by the viewer id (timeline:{id} in Redis,
 * pulse:timeline:{id} in localStorage), so switching accounts never reads
 * another account's cached data.
 */

import { toViewer, type Viewer } from './types';

const SESSION_KEY = 'pulse:session';

export function readSession(): Viewer | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? toViewer(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeSession(viewer: Viewer): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(viewer));
  } catch {
    // Private mode: the session simply does not survive a reload.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do; the in-memory state is cleared regardless.
  }
}
