<?php

namespace App\Http\Controllers;

use App\Caching\HotKeyDetector;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;

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
                return response()->json(['error' => 'User has already liked this tweet'], 409);
            }
            throw $e; // rethrow if it's a different error
        }

        // Genuinely new like — record it in both places.
        Redis::sAdd($likedByKey, $userId);

        DB::table('tweets')
            ->where('id', $tweetId)
            ->increment('like_count');
        
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

        // The inbox copy has to carry every field the timeline returns, or cards
        // read from it render with no author and zeroed counters while cards
        // from the database (page 2 onward) look correct.
        $author = Cache::remember(
            "user:{$userId}:profile",
            now()->addMinutes(5),
            function () use ($userId) {
                $row = DB::table('users')->where('id', $userId)->first(['id', 'name', 'username']);

                return $row ? (array) $row : null;
            }
        );

        $payload = json_encode([
            'id' => $tweetId,
            'user_id' => (int) $userId,
            'author_name' => $author['name'] ?? "User {$userId}",
            'author_handle' => $author['username'] ?? "user{$userId}",
            'body' => $body,
            'like_count' => 0,
            'repost_count' => 0,
            'reply_count' => 0,
            'view_count' => 0,
            'share_count' => 0,
            // Correct for everyone at this instant: a post nobody has seen yet
            // cannot have been liked or reposted by any follower.
            'liked_by_viewer' => false,
            'reposted_by_viewer' => false,
            'created_at' => now()->toDateTimeString(),
        ]);

        foreach ($followerIds as $followerId) {
            Redis::connection('default')->rPush("feed:{$followerId}", $payload);
            Redis::connection('default')->lTrim("feed:{$followerId}", -100, -1); // keep latest 100 only
        }

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
