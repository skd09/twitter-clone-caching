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
