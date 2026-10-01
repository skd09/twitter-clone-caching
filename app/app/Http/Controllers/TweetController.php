<?php

namespace App\Http\Controllers;

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
