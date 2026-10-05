import http from 'k6/http';
import { check, sleep } from 'k6';

// Exercises every instrumented path so the Grafana dashboard has all panels
// populated at once, rather than one metric at a time. Traffic is deliberately
// skewed: a small pool of users is hammered so they cross the hot-key threshold
// (20 req/10s) and the hot/cold split becomes visible.
export const options = {
  stages: [
    { duration: '20s', target: 30 },   // ramp
    { duration: '90s', target: 80 },   // sustained peak
    { duration: '30s', target: 80 },
    { duration: '20s', target: 0 },    // drain
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const BASE = 'http://127.0.0.1:8000';
const HOT_USERS = [1, 2, 1685, 5720];                 // repeatedly read -> go hot
const COLD_USERS = [100, 4242, 7777, 9999, 31337];    // long tail
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  // 70% of reads land on the hot pool, which is what makes caching pay off.
  const userId = Math.random() < 0.7 ? pick(HOT_USERS) : pick(COLD_USERS);

  const res = http.get(`${BASE}/api/users/${userId}/timeline`);
  check(res, { 'timeline 200': (r) => r.status === 200 });

  let tweets = [];
  try {
    const body = res.json();
    if (Array.isArray(body.data)) tweets = body.data;
  } catch (e) {
    // A corrupt or non-JSON body is itself a finding; don't fail the iteration.
  }

  if (tweets.length === 0) {
    sleep(0.2);
    return;
  }

  const tweet = pick(tweets);
  const payload = JSON.stringify({ user_id: userId });

  // Views: high volume, write-behind, and heavily deduped per viewer.
  http.post(`${BASE}/api/tweets/${tweet.id}/view`, payload, { headers: JSON_HEADERS });

  // Likes: ~40%. Most will 409 via the Redis fast path, which is the point.
  if (Math.random() < 0.4) {
    http.post(`${BASE}/api/tweets/${tweet.id}/like`, payload, { headers: JSON_HEADERS });
  }

  // Reposts: ~15%, plus occasional undo so the counter moves both ways.
  if (Math.random() < 0.15) {
    http.post(`${BASE}/api/tweets/${tweet.id}/repost`, payload, { headers: JSON_HEADERS });
    if (Math.random() < 0.3) {
      http.del(`${BASE}/api/tweets/${tweet.id}/repost`, payload, { headers: JSON_HEADERS });
    }
  }

  // Shares: ~10%, also write-behind.
  if (Math.random() < 0.1) {
    http.post(`${BASE}/api/tweets/${tweet.id}/share`, null, { headers: JSON_HEADERS });
  }

  // Cursor pagination: uncached by design, counted separately.
  if (Math.random() < 0.2) {
    const oldest = tweets[tweets.length - 1];
    const cursor = encodeURIComponent(`${oldest.created_at}|${oldest.id}`);
    http.get(`${BASE}/api/users/${userId}/timeline?before=${cursor}`);
  }

  // "Anything new?" poll, the path the UI runs every 15s.
  if (Math.random() < 0.15) {
    const newest = tweets[0];
    const cursor = encodeURIComponent(`${newest.created_at}|${newest.id}`);
    http.get(`${BASE}/api/users/${userId}/timeline?after=${cursor}`);
  }

  // Logins: exercises the handle cache and its negative-caching path.
  if (Math.random() < 0.05) {
    const handle = Math.random() < 0.8 ? 'miahart2' : `nosuchuser${Math.floor(Math.random() * 50)}`;
    http.post(`${BASE}/api/auth/login`,
      JSON.stringify({ username: handle, password: 'ignored' }),
      { headers: JSON_HEADERS });
  }

  // Posts: rare on purpose. Each one fans out to every follower, so this is the
  // most expensive request in the mix. Bodies are tagged for easy cleanup.
  if (Math.random() < 0.02) {
    http.post(`${BASE}/api/tweets`,
      JSON.stringify({ user_id: pick(COLD_USERS), body: `[loadtest] dashboard run ${Date.now()}` }),
      { headers: JSON_HEADERS });
  }

  sleep(Math.random() * 0.3);
}
