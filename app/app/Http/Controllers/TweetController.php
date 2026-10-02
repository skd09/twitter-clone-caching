<?php

namespace App\Http\Controllers;

use App\Caching\HotKeyDetector;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;
use App\Caching\TweetCounts;
use App\Metrics\MetricsCollector;

class TweetController extends Controller
{
    public function like(int $tweetId, Request $request)
    {
        $userId = $request->input('user_id');

        if(!$userId) {
            return response()->json(['error' => 'User ID is required'], 422);
        }

        $likedByKey = "tweet:{$tweetId}:liked_by";

        // Fast path: Redis already knows this user liked it — reject immediately, no DB hit.
        if(Redis::sIsMember($likedByKey, $userId)) {
            // Rejected without touching Postgres - the whole point of the fast path.
            app(MetricsCollector::class)->increment('likes_total', ['result' => 'duplicate_redis']);
            return response()->json(['error' => 'User has already liked this tweet'], 409);
        }

        try {
            DB::table('likes')->insert([
                'user_id' => $userId,
                'tweet_id' => $tweetId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);        
        } catch (\Illuminate\Database\QueryException $e) {
            // Postgres error code 23505 = unique_violation
            if ($e->getCode() === '23505') {
                // Redis missed it; the constraint caught it. Gap between the two.
                app(MetricsCollector::class)->increment('likes_total', ['result' => 'duplicate_db']);
                return response()->json(['error' => 'User has already liked this tweet'], 409);
            }
            throw $e; // rethrow if it's a different error
        }

        // Genuinely new like — record it in both places.
        Redis::sAdd($likedByKey, $userId);

        DB::table('tweets')
            ->where('id', $tweetId)
            ->increment('like_count');
        
        app(TweetCounts::class)->bump($tweetId, 'like_count');
        app(MetricsCollector::class)->increment('likes_total', ['result' => 'created']);
        
        $row = DB::table('tweets')
            ->where('id', $tweetId)
            ->first(['like_count', 'updated_at']);

        $this->writeIfNewer($tweetId, $row->like_count, strtotime($row->updated_at));

        return response()->json(['tweet_id' => $tweetId, 'like_count' => $row->like_count]);
    }

    public function readLikesSlow(int $tweetId)
    {
        $row = DB::table('tweets')->where('id', $tweetId)->first(['like_count', 'updated_at']);
        Log::info("SLOW READ fetched {$row->like_count} (version " . strtotime($row->updated_at) . ") for tweet {$tweetId}, about to sleep...");

        sleep(3); // Simulate a slow read

        $wrote = $this->writeIfNewer($tweetId, $row->like_count, strtotime($row->updated_at));

        Log::info(
            $wrote
                ? "SLOW READ wrote {$row->like_count} into cache for tweet {$tweetId}"
                : "SLOW READ SKIPPED writing stale {$row->like_count} — a newer version was already cached"
        );
        return response()->json(['tweet_id' => $tweetId, 'attempted_count' => $row->like_count, 'actually_wrote' => $wrote]);
    }

    public function store(Request $request, HotKeyDetector $detector)
    {
        $userId = $request->input('user_id');
        $body = $request->input('body');

        if (!$userId || !$body) {
            return response()->json(['error' => 'User ID and body are required'], 422);
        }

        $tweetId = DB::table('tweets')->insertGetId([
            'user_id' => $userId,
            'body' => $body,
            'like_count' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $isCelebrity = $detector->isHot("timeline:{$userId}");

        if ($isCelebrity) {
            // Celebrity: do NOT fan out. Followers will see this via a live
            // merge at read time, not a pre-built list.
            Log::info("Tweet {$tweetId} is now considered a hot key.");
            app(MetricsCollector::class)->increment('posts_total', ['fanout' => 'skipped_celebrity']);
            return response()->json([
                'tweet_id' => $tweetId,
                'fanned_out' => false,
                'reason' => 'celebrity — followers will see this via read-time merge',
            ]);
        }

        // Regular user: fan out to every follower's pre-built feed list.
        $followerIds = DB::table('follows')
            ->where('followed_id', $userId)
            ->pluck('follower_id');

        // A reference, not a copy. Content is immutable so it can be fetched at
        // read time; counts and per-viewer flags change, and there is no single
        // correct liked_by_viewer to copy into every follower's inbox anyway.
        $payload = json_encode([
            'id' => $tweetId,
            'created_at' => now()->toDateTimeString(),
        ]);

        foreach ($followerIds as $followerId) {
            Redis::connection('default')->rPush("feed:{$followerId}", $payload);
            Redis::connection('default')->lTrim("feed:{$followerId}", -100, -1); // keep latest 100 only
        }

        $metrics = app(MetricsCollector::class);
        $metrics->increment('posts_total', ['fanout' => 'delivered']);
        // How much work one post actually caused.
        $metrics->increment('fanout_deliveries_total', [], $followerIds->count());

        return response()->json([
            'tweet_id' => $tweetId,
            'fanned_out' => true,
            'followers_notified' => $followerIds->count(),
        ]);
    }

    private function writeIfNewer(int $tweetId, int $count, int $version): bool 
    {
        $versionKey = "tweet:{$tweetId}:likes:version";
        $currentVersion = Cache::get($versionKey, 0);

        if($version <= $currentVersion)
        {
            return false; // our data is stale or equal — refuse to overwrite
        }
        Cache::put("tweet:{$tweetId}:likes", $count, 3600);
        Cache::put($versionKey, $version, 3600);

        return true;
    }

    public function likeBuffered(int $tweetId)
    {
        $bufferedCount = Redis::incr("tweet:{$tweetId}:pending_likes");
        Redis::sAdd('tweet:with_pending_likes', $tweetId);
        return response()->json(['tweet_id' => $tweetId, 'buffered_likes' => $bufferedCount]);
    }
}
