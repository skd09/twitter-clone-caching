# Twitter Clone — a caching playground

A Twitter-style feed built specifically to **make caching behaviour visible**. Every
caching pattern here is implemented against a realistic dataset — 10,000 users,
~2,000,000 follows, 1,000,000 posts — then load-tested, measured, and written up
with the numbers it actually produced.

The point isn't the clone. It's that each pattern was taken far enough to fail, and
the failure was reproduced on demand before it was fixed.

**Stack:** Laravel 13 + Octane/RoadRunner · Postgres 16 · Redis 7 (×2) · Next.js 16 · k6

---

## The learning path

Every lab is tagged, so you can read the code as it stood at that point — or diff
one lab against the previous to see exactly what that lesson changed.

| Tag | Lab | Browse | What changed |
|---|---|---|---|
| [`lab-2`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-2) | Cache-aside — locality is the whole game | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-2) | — |
| [`lab-3`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-3) | Write-behind — and the data loss it trades for | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-3) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-2...lab-3) |
| [`lab-4`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-4) | Eviction policies from scratch (FIFO / LRU / LFU) | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-4) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-3...lab-4) |
| [`lab-5`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-5) | TTL fixed vs jittered — an honest negative result | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-5) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-4...lab-5) |
| [`lab-6`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-6) | Cache stampede — proven, fixed, re-measured | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-6) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-5...lab-6) |
| [`lab-7`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-7) | Consistency — the stale-write race | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-7) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-6...lab-7) |
| [`lab-8`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-8) | Hot/cold Redis isolation | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-8) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-7...lab-8) |
| [`lab-9`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-9) | Fan-out on write | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-9) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-8...lab-9) |
| [`lab-10`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-10) | Live counts over a fanned-out feed | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-10) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-9...lab-10) |
| [`lab-11`](https://github.com/skd09/twitter-clone-caching/releases/tag/lab-11) | Observability, and shrinking the inbox | [code](https://github.com/skd09/twitter-clone-caching/tree/lab-11) | [diff](https://github.com/skd09/twitter-clone-caching/compare/lab-10...lab-11) |

```bash
git clone https://github.com/skd09/twitter-clone-caching.git
cd twitter-clone-caching
git checkout lab-6        # the stampede lab, before and after the fix
git diff lab-5 lab-6      # or just the change itself
```

### Baseline — measure before you optimise

The uncached timeline query, load-tested properly. The first attempt measured
nothing useful: `php artisan serve` is single-process, so 20 virtual users just
queued behind each other (med 627ms, 31 req/s). Switching to Octane + RoadRunner
gave real concurrency and the honest baseline every later lab is compared against.

```
p50 128ms · p90 190ms · p95 220ms · 125 req/s · 0% errors
```

> A single-process dev server queues requests instead of running them. Caught by
> looking at the min-vs-p90 spread rather than the average.

### Lab 2 — Cache-aside, and why locality is the whole game [`lab-2`](https://github.com/skd09/twitter-clone-caching/tree/lab-2)

`Cache::remember` around the timeline query. The interesting result is that the
same code produces wildly different value depending on traffic shape:

| Traffic                 | p50      | p95   | Throughput    |
| ----------------------- | -------- | ----- | ------------- |
| Uniform (IDs 1–9999)    | 82ms     | 175ms | 194 req/s     |
| Skewed (80% hit 50 IDs) | **13ms** | 88ms  | **681 req/s** |

> Cache-aside is a bet that a key is requested again before it expires. Under
> uniform traffic across 9,999 IDs, most requests are still first-time misses.
> **Locality is what pays, not the cache.**

_Debugging lesson:_ hours lost to a key-name typo (`timer:` vs `timeline:`) while
theorising about serialization and worker state. Check the actual key in Redis first.

### Lab 3 — Write-behind, and the data loss it's actually trading for [`lab-3`](https://github.com/skd09/twitter-clone-caching/tree/lab-3)

Likes buffered in Redis (`INCR`), drained to Postgres by a flush worker using
atomic `GETDEL` so nothing is double-counted or lost between read and delete.

Then the failure was reproduced deliberately: a graceful `docker restart` survived
(RDB snapshots on clean shutdown), but a forced `docker kill` **permanently lost 5
likes with no error anywhere in the stack**.

> Write-behind temporarily makes Redis the _source of truth_, not a disposable
> cache. Running Redis without a volume is correct for query caching and wrong for
> buffered writes.

### Lab 4 — Eviction policies from scratch [`lab-4`](https://github.com/skd09/twitter-clone-caching/tree/lab-4)

`FifoCache`, `LruCache`, `LfuCache` as plain PHP — no Redis — to understand the
mechanics. FIFO was tested specifically to prove reads _don't_ affect eviction
order, which is the exact line between FIFO and LRU. LFU resolves ties by recency,
matching how Redis approximates `allkeys-lfu`.

> ⚠️ FIFO is tinker-verified. **LRU and LFU are code-reviewed but not runtime-verified.**

### Lab 5 — TTL jitter, and an honest negative result [`lab-5`](https://github.com/skd09/twitter-clone-caching/tree/lab-5)

Fixed vs jittered TTL under 100 VUs against 5 keys, three runs each:

|              | p50   | p95   | Throughput |
| ------------ | ----- | ----- | ---------- |
| Fixed TTL    | ~22ms | ~37ms | ~4000/s    |
| Jittered TTL | ~24ms | ~52ms | ~3400/s    |

**Jitter was consistently worse.** Not the expected result, and kept anyway.

> Jitter spreads synchronized expiry across a window — that only pays off if there
> are calm periods between bursts to protect. Under constant saturation there is no
> burst-vs-calm distinction, so the per-write `random_int()` cost is pure overhead.
> Jitter is multi-key hygiene, not a single-hot-key fix.

### Lab 6 — Cache stampede: proven, then fixed, then re-measured [`lab-6`](https://github.com/skd09/twitter-clone-caching/tree/lab-6)

A `HotKeyDetector` (Redis `INCR` + fixed-window TTL, the rate-limiter pattern) flags
keys crossing 20 req/10s. Then the stampede was proven by **logging every real DB
query execution** rather than inferring it from latency:

```
200 concurrent requests, one cold key  ->  12 separate DB queries
```

All 200 requests slowed to 430–500ms, not just the 12 — the stampede degraded the
whole burst.

The first fix _looked_ right but only got 12 → 14, because an unlocked
`Cache::get()` before lock acquisition left a race window. Wrapping
`Cache::remember` entirely inside the lock gave an exact **+1**.

|              | DB queries | Max latency |
| ------------ | ---------- | ----------- |
| Unprotected  | 12         | 499ms       |
| Fully locked | **1**      | **2.83s**   |

> The fix works, and it converts parallel waste into a strict queue. The 200th
> request waits behind 199 others. A fix that works at 5 concurrent requests is not
> proof it works at 200.

### Lab 7 — Consistency: the stale-write race [`lab-7`](https://github.com/skd09/twitter-clone-caching/tree/lab-7)

Reproduced on demand with a deliberate 3s delay: a slow reader overwrites the cache
with a value that was already stale by the time it landed.

```
before fix:  Postgres 187  ·  Redis 186   <- cache lies
after fix:   Postgres 188  ·  Redis 188
```

Fixed not with more locking, but by **versioning the data** — cache writes carry the
row's `updated_at`, and `writeIfNewer()` refuses out-of-order writes.

> Same principle as the `UNIQUE(user_id, tweet_id)` constraint and Redis's atomic
> `INCR`: push the guarantee into the data, not into the timing.

### Lab 8 — Hot/cold isolation at the infrastructure level [`lab-8`](https://github.com/skd09/twitter-clone-caching/tree/lab-8)

Two separate Redis containers, not two databases on one. Hot keys bypass the cache
facade entirely and go to `:6381` as JSON; cold keys use `Cache::` on `:6380`.
Isolation verified both ways.

_Bug found:_ hotness was read from the _current window_ only, so a key already in
`hot_keys` reported `hot:false` after the window rolled. Now sticky.

### Lab 9 — Fan-out on write, and what delivery actually costs [`lab-9`](https://github.com/skd09/twitter-clone-caching/tree/lab-9)

Posting pushes an entry into every follower's Redis inbox (`feed:{followerId}`,
capped at 100). Reading opens the inbox instead of re-running the follows join.
Celebrities are deliberately **skipped** — copying into millions of inboxes inline
is the cost fanout can't absorb — and merged in at read time instead.

One post by an account with 180 followers costs **180 Redis writes**. That number,
visible as `fanout_deliveries_total` on the dashboard, is the whole argument for the
celebrity split.

> The lesson that only shows up when you build it: **fanout only delivers posts made
> after you switch it on.** Flipping the read path over dropped one feed from 201
> followed accounts to 2 — not broken, just never delivered to.

Hence `feeds:backfill`, which seeds inboxes from posts that already exist — the same
job real systems run when enabling fanout, and again on every new follow.

### Lab 10 — Live counts over a fanned-out feed [`lab-10`](https://github.com/skd09/twitter-clone-caching/tree/lab-10)

Fanout's trade-off arrives immediately: an inbox entry is a **photocopy taken at
posting time**. Like a post and the database is correct, but the feed still reads
the frozen copy. Worse, `liked_by_viewer` is *different for every follower*, so
there is no single correct value to copy into 180 inboxes at all.

```
POST /like  -> 200, like_count: 1     the write worked
POSTGRES    -> like_count = 1         the database is correct
feed says   -> like_count = 0         the feed is lying
```

Fixed by splitting the post into what changes and what doesn't:

| Field | Source |
|---|---|
| body, author | immutable — safe to read once, cached or joined |
| counters | `TweetCounts` — Redis hash, Postgres fallback, self-refilling |
| `liked_by_viewer` | live per-request lookup, never shared |

`TweetCounts` seeds from the database column **plus the unflushed write-behind
buffer**, otherwise views already sitting in Redis are invisible and the feed
disagrees with the endpoint that just returned them.

> Anything per-viewer is wrong to store in a shared snapshot. That single rule is
> what the whole lab is about.

### Lab 11 — Observability, and shrinking the inbox [`lab-11`](https://github.com/skd09/twitter-clone-caching/tree/lab-11)

Every cache now reports hit and miss to Prometheus, scraped from `/api/metrics` and
rendered in a provisioned Grafana dashboard. Under a 45-second mixed load:

```
CACHE HIT RATE          LIKES (ops/s)              VIEWS (ops/s)
  profile    99.8%        duplicate_redis  24.31     deduped  43.40
  hot        99.6%        created           3.64     counted   3.01
  celebrity  98.3%
  counts     94.6%
```

Those two right-hand columns are the payoff of earlier labs, measured: the Redis
fast-path absorbs **87% of like traffic** without touching Postgres, and the
per-viewer dedupe discards **93% of impressions** that would otherwise inflate view
counts ~15x.

With counts and flags now resolved at read time, the inbox copy was storing fields
nobody read. Trimmed to `{id, created_at}` — references, not copies — with content
hydrated by one primary-key query per page:

```
redis memory:   168 MB   ->  27.5 MB          (6.1x)
backfill rate:  0.15 s   ->  0.057 s per user  (10,000 inboxes in 8m09s)
```

The expensive 2M-row follows join stays skipped, which was always the point. A
deleted post now also disappears from every feed instead of lingering as a frozen
copy.

---

## Patterns covered

| Pattern                            | Where                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| Cache-aside                        | `TimelineController`, `TweetController::like` (boolean check)     |
| Write-through                      | `TweetController::like`, repost, reply                            |
| Write-behind + flush worker        | `likeBuffered`, `view`, `share` → `FlushLikes`, `FlushEngagement` |
| Negative caching                   | failed logins in `AuthController`                                 |
| TTL design, fixed vs jittered      | `TimelineController`                                              |
| Stampede protection                | `Cache::lock()->block()`                                          |
| Versioned writes                   | `writeIfNewer()`                                                  |
| Hot-key detection                  | `HotKeyDetector`                                                  |
| Hot/cold instance split            | `redis.hot` connection                                            |
| Fan-out on write + read-time merge | `TweetController::store`, `getMergedFeed`                         |
| Inbox as references + hydration    | `hydrateContent()` — one primary-key query per page               |
| Per-entity counter cache           | `TweetCounts` — Redis hash, Postgres fallback, Lua-guarded bump   |
| Cache instrumentation              | `MetricsCollector` — hit/miss per source, scraped by Prometheus   |
| Keyset pagination                  | `?before=` / `?after=` cursors                                    |
| Eviction policies                  | `FifoCache`, `LruCache`, `LfuCache`                               |

---

## Running it

```bash
docker compose -f infra/docker-compose.yml up -d      # Postgres :5433, Redis :6380 + :6381

cd app
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate
php artisan db:seed                                   # ~1M posts, then realistic content
php artisan feeds:backfill                            # seed fanout inboxes (~25 min, ~168MB)
php artisan octane:start --server=roadrunner

cd ../web
npm install && npm run dev                            # http://localhost:3000
```

| | |
|---|---|
| App | http://localhost:3000 |
| Metrics (Prometheus format) | http://localhost:8000/api/metrics |
| Prometheus | http://localhost:9090 |
| Grafana dashboard | http://localhost:3001/d/tcc-caching |

Grafana needs no login and no setup — the datasource and dashboard are provisioned
from `infra/grafana/`, so a fresh `docker compose up` brings them up populated. Any
`.json` dropped into `infra/grafana/dashboards/` is picked up within 10 seconds.

Sign in with any seeded username (`miahart2`, `miloquinn1685`, …). The password is
accepted and ignored.

**Useful commands**

```bash
php artisan feeds:backfill --missing      # resume a partial backfill
php artisan likes:flush                   # drain buffered likes
php artisan engagement:flush              # drain buffered views/shares
php artisan octane:reload                 # REQUIRED after editing routes/controllers
php artisan feeds:backfill --missing      # resume a partial backfill (inboxes are not an id prefix)
k6 run loadtest/skewed.js                 # also: baseline, stampede, avalanche
```

> Octane holds the framework in memory. If behaviour doesn't match the code on disk,
> reload before debugging anything else. This cost real time more than once.

---

## Layout

```
app/      Laravel API
  Caching/        eviction policies + HotKeyDetector
  Console/        flush workers, feeds:backfill
infra/    docker-compose (Postgres + 2x Redis + Prometheus + Grafana)
  grafana/        provisioned datasource and dashboard, version-controlled
loadtest/ k6 scenarios per lab
web/      Next.js feed — all HTTP via a single gateway in lib/api/
docs/     progress.md — the long-form lab notes these summaries come from
```

---

## Known gaps

Kept visible on purpose.

- **LRU/LFU are not runtime-verified** (see Lab 4).
- **Celebrity detection measures the wrong thing.** It checks how often a user
  _reads their own feed_, not how many followers they have.
- **Hot keys never cool down.** `HotKeyDetector` short-circuits on an already-hot
  key, so the counter stops incrementing and hotness is permanent by construction.
- **`/api/metrics` emits no `# TYPE` headers**, so Prometheus treats every series as
  untyped. `rate()` still works; Grafana just can't tell counters from gauges.
- **Fanout is synchronous and unpipelined** — two Redis round trips per follower,
  inline in the request. Belongs on a queue.
- **Sign-in is not authentication.** The password is discarded.
- **Backfill doesn't run on follow**, so following someone still won't surface their
  older posts.
- **Display names are not unique** — 10,000 users over 4,096 name combinations.
  Handles disambiguate.
