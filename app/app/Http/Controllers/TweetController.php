<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

        DB::table('tweets')
            ->where('id', $tweetId)
            ->increment('like_count');
        
        $newCount = DB::table('tweets')
            ->where('id', $tweetId)
            ->value('like_count');
        
        Cache::put("tweet:{$tweetId}:likes", $newCount, 3600);

        return response()->json(['tweet_id' => $tweetId, 'like_count' => $newCount]);
    }

    public function likeBuffered(int $tweetId)
    {
        $bufferedCount = Redis::incr("tweet:{$tweetId}:pending_likes");
        Redis::sAdd('tweet:with_pending_likes', $tweetId);
        return response()->json(['tweet_id' => $tweetId, 'buffered_likes' => $bufferedCount]);
    }
}
