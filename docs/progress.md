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
