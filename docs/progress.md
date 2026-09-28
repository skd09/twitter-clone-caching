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
