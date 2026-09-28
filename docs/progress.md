# Progress

## Step 1: project skeleton
Created app, web, infra, loadtest and docs folders and ran git init. Each layer of the system (API, frontend, infra, traffic, notes) has its own home from day one.
Interview line: "I structured the repo by system layer so the caching experiments stay separate from the app code."

## Step 2: Laravel installed
Installed Laravel 13.33.0 into the app folder with composer create-project and confirmed it serves the welcome page.
Interview line: "I built the API in Laravel so the caching layers I studied map straight onto tools I already use in production."

## Step 3: Redis and Postgres in Docker
Added infra/docker-compose.yml with Postgres 16 and Redis 7. Port 5432 was already taken on my Mac, so Postgres is exposed on host port 5433 (container port stays 5432). Redis has no volume on purpose, because a cache can be rebuilt.
Interview line: "I run the datastores in Compose so I can wipe and rebuild the environment before every experiment."

## Step 6: seed data
Seeded 10,000 users, about 2 million follows (200 random picks per user, so roughly 199 after dedupe) and 1,000,000 tweets over the last 30 days, using Postgres generate_series instead of PHP factories. Everyone follows user 1, who becomes the celebrity account for the hot-key lab.
Interview line: "I generated the data set inside Postgres, so a million rows took seconds instead of minutes."

## Step 7: timeline endpoint, no cache
Built GET /api/users/{id}/timeline: 20 newest tweets from followed accounts, via a join on follows. Route lives in api.php (no session middleware) so timings measure the query, not session overhead. Baseline for user 2: first two requests 139ms/179ms (cold), then steady at 36ms once warm. This is the number every cache strategy has to beat.
Interview line: "I measured the uncached baseline first, with session middleware excluded, so every cache win I report later is real and not noise."

## Step 8: real baseline load test (Octane + RoadRunner)
php artisan serve (single process) was misleading: 20 concurrent VUs queued behind each other, med=627ms, only 31 req/s. Switched to Laravel Octane with RoadRunner (Swoole failed to compile against this macOS/Clang setup - a known upstream bug, not a config issue). With Octane serving real concurrency: p50=128ms, p90=190ms, p95=220ms, max=418ms, 125 req/s, 0% errors, over 20 VUs / 50s / random user IDs 1-9999. This is the official "no cache" baseline every later lab is measured against.
Interview line: "My first load test lied to me, because a single-process dev server queues requests instead of running them concurrently. I caught it by checking min vs p90 spread, not just the average."

## Lab 2: cache-aside
Wrapped the timeline query in Cache::remember (key: timeline:{userId}, TTL 60s). Debugging note: spent significant time chasing false leads (Octane worker state, PHP version mismatch, igbinary serialization) before finding the real bug — a leftover key name typo (timer: instead of timeline:) meant the cache was silently missing the whole time. Lesson: verify the actual key name in Redis before theorizing about deeper causes.
Results against the Step 8 baseline (p50=128ms, p90=190ms, p95=220ms, 125 req/s):
- Uniform random traffic (k6 baseline.js, IDs 1-9999): p50=82ms, p90=154ms, p95=175ms, 194 req/s. Modest gain — most requests are still first-time misses since 9999 IDs barely repeat within one run.
- Skewed traffic (k6 skewed.js, 80% of requests hit a 50-ID pool): p50=13ms, p90=62ms, p95=88ms, 681 req/s. A ~90% drop in p50 and 5.4x throughput, same code, same 20 VUs — traffic locality is what makes cache-aside pay off, not the cache itself.
Interview line: "Cache-aside is a bet that the same key gets requested again before it expires. I measured it under both uniform and skewed traffic to show the payoff depends entirely on locality, not on the caching code."

## Lab 3: write-behind (buffered likes)
Built likeBuffered endpoint: Redis::incr on tweet:{id}:pending_likes plus Redis::sadd to tweet:with_pending_likes, no DB write on the request path. A separate likes:flush command (FlushLikes) reads the pending set, atomically GETDELs each tweet's pending count, and applies it to Postgres in one increment, then removes the tweet from the pending set. Verified end to end: 4 buffered likes on tweet 5 (Redis) flushed into Postgres like_count going 257 -> 261, pending key gone after flush.
Debugging notes: Cache:: and Redis:: facades use different Redis logical databases in our setup (Cache -> db 1, Redis -> db 0) - cost real time checking the wrong db with redis-cli. Also hit a Laravel 13 gotcha: make:command scaffolds a #[Signature(...)] PHP attribute that silently overrides the $signature property if both are present.
Interview line: "Write-behind trades durability for speed - the buffered likes only exist in Redis until a worker flushes them, so I used an atomic GETDEL to avoid double-counting or losing likes between the read and the delete."

## Frontend Slice 1: feed + likes
Built a minimal Next.js feed page (Pulse) that fetches the cached timeline (Lab 2) and wires a like button to the write-through endpoint (Lab 3). Confirmed end to end in the browser: clicking Like increments Postgres, writes through to Redis, and the on-screen count updates immediately from the response. Kept write-behind (buffered likes) out of the UI for now, since its whole point is that the count doesn't update instantly, and that's a distinct UI problem worth its own slice later.
Interview line: "I built a thin vertical slice through the whole stack early, so every caching lab from here on has a real UI to demonstrate, not just load-test numbers."
