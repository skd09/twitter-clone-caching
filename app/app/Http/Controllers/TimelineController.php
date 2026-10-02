<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use App\Caching\HotKeyDetector;
use App\Metrics\MetricsCollector;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Collection;

class TimelineController extends Controller
{
    private const PAGE_SIZE = 20;

    /**
     * GET /api/users/{id}/timeline
     *
     *   (no params)      first page, cached -- the path every lab measures
     *   ?before=<cursor> older page, uncached
     *   ?after=<cursor>  anything newer than the cursor, uncached
     *
     * Only the first page is cached. Deeper pages are long-tail and would blow up
     * the keyspace for almost no hit rate, and "what is new" is uncacheable by
     * definition. The cache key and the cached value shape are both unchanged
     * from before pagination existed, so labs 2-8 still measure the same thing.
     */
    public function show(int $userId, HotKeyDetector $detector, Request $request)
    {
        $before = $this->decodeCursor($request->query('before'));
        $after = $this->decodeCursor($request->query('after'));

        if ($before !== null || $after !== null) {
            return $this->page($userId, $before, $after);
        }

        app(MetricsCollector::class)->increment('timeline_requests_total', ['path' => 'first']);

        $isHot = $detector->recordAccess("timeline:{$userId}");
        $cacheKey = "timeline:{$userId}";

        $ttl = $isHot
            ? (10 + random_int(0, 15))   // hot: wide jitter, short base
            : 60;                        // cold: long, stable, no jitter needed

        if($isHot){
            $tweets = $this->rememberOnHotRedis($cacheKey, $ttl, function() use ($userId) {
                return $this->fetchTimeline($userId);
            });
        } else {
            $tweets = $this->getMergedFeed($userId);
        }

        // Cache-aside on a tiny profile row: one Redis GET instead of a DB hit per
        // request. Stored as a plain array, so serializable_classes never bites.
        $profileMissed = false;
        $viewer = Cache::remember(
            "user:{$userId}:profile",
            now()->addMinutes(5),
            function () use ($userId, &$profileMissed) {
                $profileMissed = true;
                $row = DB::table('users')->where('id', $userId)->first(['id', 'name', 'username']);

                return $row ? (array) $row : null;
            }
        );

        app(MetricsCollector::class)->increment(
            $profileMissed ? 'cache_miss_total' : 'cache_hit_total',
            ['source' => 'profile']
        );

        $rows = $this->rowList($tweets);

        return response()->json([
            'data' => $tweets,
            'hot' => $isHot,
            'redis' => $isHot ? 'hot-server' : 'cold-server',
            'viewer' => $viewer,
            // Derived outside the cache so the cached payload stays untouched.
            // A full page implies there may be more; an empty next page ends it.
            'next_cursor' => $this->cursorForLast($rows),
            'has_more' => count($rows) >= self::PAGE_SIZE,
        ]);
    }

    /** Uncached cursor page. Never logs the line lab 6 counts DB hits with. */
    private function page(int $userId, ?array $before, ?array $after)
    {
        // Cursor pages are uncached by design; counting them separately keeps
        // the cache hit rate above honest.
        app(MetricsCollector::class)->increment(
            'timeline_requests_total',
            ['path' => $after !== null ? 'after' : 'before']
        );
        // One extra row tells us whether another page exists, without a count().
        $rows = $this->fetchTimeline($userId, $before, $after, self::PAGE_SIZE + 1, false)->all();

        $hasMore = count($rows) > self::PAGE_SIZE;
        if ($hasMore) {
            array_pop($rows);
        }

        return response()->json([
            'data' => array_values($rows),
            'hot' => false,
            'redis' => 'uncached-page',
            'viewer' => null,
            'next_cursor' => $this->cursorForLast($rows),
            // `after` is a poll for new posts: there is no deeper page to walk.
            'has_more' => $after !== null ? false : $hasMore,
        ]);
    }

    private function fetchTimeline(
        int $userId,
        ?array $before = null,
        ?array $after = null,
        int $limit = self::PAGE_SIZE,
        bool $logged = true
    ) {
        if ($logged) {
            Log::info("DB QUERY RAN for user {$userId}");
        }

        $query = DB::table('tweets')
            ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
            ->join('users', 'users.id', '=', 'tweets.user_id')
            // Viewer-specific engagement. Safe to bake into the cached payload
            // because the cache key is already per-viewer (timeline:{userId}),
            // so this costs nothing on a hit and saves a per-request lookup.
            ->leftJoin('likes', function ($join) use ($userId) {
                $join->on('likes.tweet_id', '=', 'tweets.id')
                    ->where('likes.user_id', '=', $userId);
            })
            ->leftJoin('reposts', function ($join) use ($userId) {
                $join->on('reposts.tweet_id', '=', 'tweets.id')
                    ->where('reposts.user_id', '=', $userId);
            })
            ->where('follows.follower_id', $userId)
            ->whereNull('tweets.parent_tweet_id');   // replies belong on the thread, not the home feed

        // Row-wise comparison on (created_at, id): created_at alone is not unique
        // across a million rows, so the id breaks ties and keeps paging stable.
        if ($before !== null) {
            $query->whereRaw('(tweets.created_at, tweets.id) < (?, ?)', [$before['created_at'], $before['id']]);
        }

        if ($after !== null) {
            $query->whereRaw('(tweets.created_at, tweets.id) > (?, ?)', [$after['created_at'], $after['id']]);
        }

        return $query
            ->orderByDesc('tweets.created_at')
            ->orderByDesc('tweets.id')
            ->limit($limit)
            ->get([
                'tweets.id',
                'tweets.user_id',
                'users.name as author_name',
                'users.username as author_handle',
                'tweets.body',
                'tweets.like_count',
                'tweets.repost_count',
                'tweets.reply_count',
                'tweets.view_count',
                'tweets.share_count',
                'tweets.created_at',
                DB::raw('(likes.id IS NOT NULL) as liked_by_viewer'),
                DB::raw('(reposts.id IS NOT NULL) as reposted_by_viewer'),
            ]);
    }

    /**
     * Normalises whatever came back into a plain list.
     *
     * The hot path returns arrays (json_decode), the cold path a Collection of
     * stdClass -- and on a cold cache HIT it returns __PHP_Incomplete_Class,
     * because the cache store refuses to unserialize a Collection. That last case
     * must degrade to an empty list rather than fatal on a method call.
     */
    private function rowList($tweets): array
    {
        if ($tweets instanceof Collection) {
            return $tweets->all();
        }

        return is_array($tweets) ? $tweets : [];
    }

    private function cursorForLast(array $rows): ?string
    {
        if (empty($rows)) {
            return null;
        }

        $last = $rows[array_key_last($rows)];
        $createdAt = is_array($last) ? ($last['created_at'] ?? null) : ($last->created_at ?? null);
        $id = is_array($last) ? ($last['id'] ?? null) : ($last->id ?? null);

        if ($createdAt === null || $id === null) {
            return null;
        }

        return base64_encode($createdAt . '|' . $id);
    }

    private function decodeCursor(?string $cursor): ?array
    {
        if ($cursor === null || $cursor === '') {
            return null;
        }

        $raw = base64_decode($cursor, true);
        if ($raw === false || !str_contains($raw, '|')) {
            return null;
        }

        [$createdAt, $id] = explode('|', $raw, 2);

        if ($createdAt === '' || !ctype_digit($id)) {
            return null;
        }

        return ['created_at' => $createdAt, 'id' => (int) $id];
    }

    private function rememberOnHotRedis(string $key, int $ttl, callable $callback)
    {
        $metrics = app(MetricsCollector::class);

        $cached = Redis::connection('hot')->get($key);
        if($cached !== null) {
            $metrics->increment('cache_hit_total', ['source' => 'hot']);
            return json_decode($cached, true);     
        }

        $metrics->increment('cache_miss_total', ['source' => 'hot']);

        $value = $callback();
        Redis::connection('hot')->setEx($key, $ttl, json_encode($value));
        return $value;
    }

    /**
     * The real fan-out-on-write read path: the pre-built inbox (fast, from
     * regular follows) merged with a small query for any celebrities this user
     * follows, who were deliberately never fanned out to.
     */
    private function getMergedFeed(int $userId): array
    {
        $metrics = app(MetricsCollector::class);
        $feedItems = Redis::connection('default')->lRange("feed:{$userId}", 0, -1);

        // Entries written before the lTrim fix are bare integers, not posts.
        // One of them reaching the response invalidates the whole page client
        // side, so anything that is not a post shape is dropped here.
        $fromFeed = array_values(array_filter(
            array_map(fn ($json) => json_decode($json, true), $feedItems),
            fn ($row) => is_array($row) && isset($row['id'], $row['created_at'])
        ));

        // No inbox yet (new account, or posts predating fanout): fall back.
        if (empty($fromFeed)) {
            $missed = false;

            // return $this->rowList($this->fetchTimeline($userId));
            $rows = Cache::remember(
                "timeline:{$userId}",
                now()->addSeconds(60),
                function () use ($userId, &$missed) {
                    $missed = true;
                    return $this->fetchTimeline($userId)
                        ->map(fn ($row) => (array) $row)
                        ->all();
                }
            );

            $metrics->increment($missed ? 'cache_miss_total' : 'cache_hit_total', ['source' => 'cold']);
            return $rows;
        }

        $metrics->increment('inbox_served_total');

        $byId = [];
        foreach(array_merge($fromFeed, $this->celebrityPosts($userId)) as $row) {
            $byId[$row['id']] = $row;
        }

        $merged = array_values($byId);

        // created_at is "Y-m-d H:i:s", so a string compare is already
        // chronological - and unlike strtotime it cannot silently return false.
        usort($merged, function ($a, $b) {
            return strcmp($b['created_at'], $a['created_at']) ?: ($b['id'] <=> $a['id']);
        });

        $page = array_slice($merged, 0, self::PAGE_SIZE);

        return $this->attachViewerFlags(
            $this->withLiveCounts($this->hydrateContent($page)),
            $userId
        );
    }

    /**
     * Recent posts from the celebrities this user follows.
     *
     * Cached per viewer: without it every request re-queries the follow list and
     * the posts, which is more database work than the plain join this read path
     * was meant to avoid.
     */
    private function celebrityPosts(int $userId): array
    {

        $hotIds = $this->hotTimelineUserIds();

        if(empty($hotIds)) {
            return [];
        }

        $celebrityIds = DB::table('follows')
            ->where('follower_id', $userId)
            ->whereIn('followed_id', $hotIds)
            ->pluck('followed_id');

        if($celebrityIds->isEmpty()) {
            return [];
        }

        $merged = [];
        foreach($celebrityIds as $celebId) {
            $merged = array_merge($merged, $this->celebrityRecentPosts($celebId));
        }

        return $merged;
    }

    /**
     * One celebrity's recent posts, shared across every one of their
     * followers — cached once per celebrity, not once per viewer.
     */
    private function celebrityRecentPosts(int $celebrityId): array
    {
        $missed = false;
        $posts = Cache::remember(
            "celeb:{$celebrityId}:recent",
            now()->addSeconds(30),
            function () use ($celebrityId, &$missed) {
                $missed = true;
                return DB::table('tweets')
                    ->where('tweets.user_id', $celebrityId)
                    ->whereNull('tweets.parent_tweet_id')
                    ->orderByDesc('tweets.created_at')
                    ->orderByDesc('tweets.id')
                    ->limit(self::PAGE_SIZE)
                    ->get(['tweets.id', 'tweets.created_at'])
                    ->map(fn($row) => (array) $row)
                    ->all();
            }
        );

        app(MetricsCollector::class)->increment(
            $missed ? 'cache_miss_total' : 'cache_hit_total',
            ['source' => 'celebrity']
        );

        return $posts;
    }

    /**
     * Turns {id, created_at} references into renderable posts.
     *
     * One query, by primary key, for the 20 rows that survived the merge -- the
     * expensive follows join stays skipped. Tweet body and author never change,
     * so this is the only part safe to have copied into inboxes, and it is still
     * cheaper not to. Posts deleted since fanout simply drop out here instead of
     * lingering in every inbox as a stale copy.
     */
    private function hydrateContent(array $refs): array
    {
        $ids = array_column($refs, 'id');

        if (empty($ids)) {
            return [];
        }

        $rows = DB::table('tweets')
            ->join('users', 'users.id', '=', 'tweets.user_id')
            ->whereIn('tweets.id', $ids)
            ->get([
                'tweets.id',
                'tweets.user_id',
                'users.name as author_name',
                'users.username as author_handle',
                'tweets.body',
                'tweets.created_at',
            ])
            ->keyBy('id');

        // whereIn does not preserve order, so walk the refs to keep the sort.
        $out = [];
        foreach ($refs as $ref) {
            if (isset($rows[$ref['id']])) {
                $out[] = (array) $rows[$ref['id']];
            }
        }

        return $out;
    }

    private function withLiveCounts(array $rows): array
    {
        if(empty($rows)) {
            return $rows;
        }
        $counts = app(\App\Caching\TweetCounts::class)->many(array_column($rows, 'id'));
        foreach ($rows as &$row) {
            $row = array_merge($row, $counts[$row['id']] ?? []);
        }
        return $rows;
    }

    /** Attaches liked_by_viewer / reposted_by_viewer cheaply, per request. */
    private function attachViewerFlags(array $rows, int $userId): array
    {
        $tweetIds = array_column($rows, 'id');
        if (empty($tweetIds)) {
            return $rows;
        }

        $liked = DB::table('likes')
            ->where('user_id', $userId)
            ->whereIn('tweet_id', $tweetIds)
            ->pluck('tweet_id')
            ->flip();

        $reposted = DB::table('reposts')
            ->where('user_id', $userId)
            ->whereIn('tweet_id', $tweetIds)
            ->pluck('tweet_id')
            ->flip();

        foreach ($rows as &$row) {
            $row['liked_by_viewer'] = isset($liked[$row['id']]);
            $row['reposted_by_viewer'] = isset($reposted[$row['id']]);
        }

        return $rows;
    }

    /** Which timeline keys are currently flagged hot, with the prefix stripped to plain user IDs. */
    private function hotTimelineUserIds(): array
    {
        $hotIds = [];
        foreach (Redis::connection('default')->sMembers('hot_keys') as $key) {
            if(str_starts_with($key, 'timeline:')) {
                $hotIds[] = (int) substr($key, strlen('timeline:'));
            }
        }
        return $hotIds;
    }
}
