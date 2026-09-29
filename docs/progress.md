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

## Lab 3 continued: write-behind data loss demo
Buffered 5 likes on tweet 10 via like-buffered (Redis only, Postgres untouched at like_count=273). A graceful docker restart survived intact - Redis's default RDB snapshotting saves on clean shutdown and reloads on start. A forced docker kill + rm (no volume backing the container) permanently lost all 5 likes: pending key came back nil, Postgres stayed at 273, no error anywhere in the stack.
Root cause, precisely stated: write-behind temporarily makes Redis the sole source of truth for unflushed data, not just a disposable cache. Our earlier choice to run Redis with no volume ("a cache can be rebuilt") is correct for query-result caching (Lab 2) but wrong for buffered writes (Lab 3) - those need real persistence (AOF/volume) or a durable queue, not a bare key.
Interview line: "I demonstrated the exact failure mode of write-behind by killing Redis mid-buffer without a volume - the likes vanished with zero errors anywhere in the stack, which is the real cost you're trading for write speed, and why write-behind should only be used for data where that loss is acceptable."

## Lab 4: FIFO eviction cache
Implemented FifoCache (app/Caching/), a plain PHP class with no Redis involved - pure in-memory eviction logic, capacity-bound. Verified with tinker: filled to capacity, read a key (get() must not affect eviction order in FIFO), inserted past capacity, confirmed the oldest key was evicted despite being recently read, confirmed newer keys survived. Initial bug: a private constructor blocked instantiation from outside the class - fixed to public.
Interview line: "I built FIFO first as a warm-up and specifically tested that reads don't influence eviction order, since that's the exact behavior that distinguishes FIFO from LRU."

## Lab 4: LRU and LFU eviction caches
Implemented LruCache and LfuCache (app/Caching/). LRU: unset+reassign on both get() and put() to move a touched key to the most-recently-used end of $this->store; array_shift() evicts the least-recently-used key at capacity. LFU: a parallel $frequency array tracks access counts per key; eviction finds all keys tied for the minimum frequency via array_keys($frequency, min($frequency)), then breaks ties by walking $this->store in order to find the earliest (least recently touched) among them - so LFU is really "frequency first, recency as tiebreak," matching how Redis's allkeys-lfu approximates it.
Status: both classes are code-reviewed (one real bug caught and fixed in LRU's get(), which was unconditionally calling array_shift() and evicting an unrelated key on every read) but NOT runtime-verified - a tinker paste and a standalone PHP script both hit tooling/path friction rather than confirming behavior. This is a known gap: before relying on either class in a load test or interview claim, run the LRU/LFU sequences described earlier in this session end to end.

## Lab 5: TTL design (fixed vs jittered, cache avalanche)
Attempt 1: warmed 50 keys at once with a 10s fixed TTL, tested with 10 VUs / 50 keys. Avalanche barely visible (p95=4.28ms, one 269ms outlier) - traffic was too sparse per key (10 VUs across 50 keys = low contention on any single key at its expiry instant) to force a real pileup.
Attempt 2: redesigned traffic to 100 VUs against only 5 keys, to force real contention. Fixed TTL (10s, all keys warmed together) showed a real spread: p50=21.77ms, p95=36.47ms, max=380ms. Switched to jittered TTL (10 + random_int(0,5)s) under IDENTICAL traffic and reran 3x total for each variant to rule out single-run noise:
- Fixed (2 runs): p50 ~22-23ms, p95 ~36-38ms, throughput ~3900-4100/s
- Jittered (2 runs): p50 ~24-25ms, p95 ~52ms, throughput ~3300-3450/s
Jitter was consistently WORSE here, not better as expected. Root cause: with only 5 keys under 100 VUs of continuous pressure, the system never reaches a calm baseline between bursts - it's saturated (~3-4k req/s) the whole time. Jitter's benefit (spreading synchronized expiry across a time window) only pays off when there ARE calm periods between bursts for it to protect; under constant saturation there's no "burst vs calm" distinction left, so jitter's real but small per-request cost (random_int() on every cache write) shows up as pure overhead with no offsetting benefit.
Interview line: "I tested jitter under sustained saturation and found it added overhead without helping, because jitter spreads synchronized expiry across a time window, and that only pays off if there's a calm period between bursts for it to protect - under constant load there isn't one. Jitter is multi-key hygiene, not a single hot-key fix; a single key under constant heavy traffic needs a different tool, like a lock or single-flight coalescing, which is what Lab 6 covers."

## Lab 6 setup: live hot-key detection + differentiated jitter
Built HotKeyDetector (app/Caching/): Redis::incr on a per-key counter with a 10s TTL set only on the first increment of each window (fixed-window rate limiting), flags a key as hot in a hot_keys Redis set once it crosses 20 requests/10s. Wired into TimelineController: every request records access and the response includes whether that key is currently hot. Verified live: hammered user 1's timeline 25x, requests 1-19 returned hot:false, request 20 onward flipped to hot:true - detection driven by real traffic, not hardcoded.
Used this to differentiate TTL strategy: hot keys get a short base (10s) + wide jitter (0-15s) to spread contention; cold keys get a longer, stable TTL (60s) with no jitter, since they rarely see concurrent requests in the first place.
Debugging note: after editing the controller, hot stopped appearing in responses even though the code was correct - Octane was serving a stale in-memory copy of the class from before the edit. Restarting Octane fixed it immediately. Lesson: any time controller behavior doesn't match the code on disk, restart Octane before debugging further - it caches booted classes across requests by design.
Interview line: "I built live hot-key detection with a Redis counter and fixed window, the same INCR-with-TTL-on-first-write pattern as a rate limiter, and used it to apply wider TTL jitter only to keys that traffic actually proved were hot, rather than guessing or hardcoding which accounts matter."

## Lab 6: cache stampede, reproduced with real proof
Flushed the timeline cache for the known-hot user 1 (hot_keys flag preserved from earlier detection), fired 200 concurrent requests (k6, vus=200, iterations=200, effectively simultaneous - whole burst completed in 0.5s) with no stampede protection. Added a Log::info() inside the Cache::remember closure to count actual DB query executions directly, not infer them from latency.
Result: grep -c on the log showed 12 separate DB queries ran for the same cache key in the same instant, not 1. Every one of the 200 requests, not just the 12 that hit Postgres, took 430-500ms uniformly - the stampede degraded the whole burst, not just the unlucky requests, because the 12 simultaneous heavy joins saturated shared DB capacity. 12 (not all 200) likely reflects Octane/RoadRunner's worker pool ceiling capping true simultaneity - worth revisiting worker count tuning, deferred back in Step 8, now that it's visibly relevant.
Interview line: "I proved the stampede directly by logging every real DB query execution rather than inferring it from latency - 12 queries fired for what should have been one cache miss, and the resulting DB load degraded latency for the entire burst, not just the requests that caused it."
