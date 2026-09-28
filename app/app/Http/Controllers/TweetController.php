<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Redis;

class TweetController extends Controller
{
    public function like(int $tweetId)
    {
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
