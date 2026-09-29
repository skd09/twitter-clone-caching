<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Caching\HotKeyDetector;

class TimelineController extends Controller
{
    public function show(int $userId, HotKeyDetector $detector)
    {
        $isHot = $detector->recordAccess("timeline:{$userId}");

        $ttl = $isHot
            ? now()->addSeconds(10 + random_int(0, 15))   // hot: wide jitter, short base
            : now()->addSeconds(60);                        // cold: long, stable, no jitter needed

        $tweets = Cache::remember(
            "timeline:{$userId}",
            $ttl,
            function () use ($userId) {
                return DB::table('tweets')
                    ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
                    ->where('follows.follower_id', $userId)
                    ->orderByDesc('tweets.created_at')
                    ->limit(20)
                    ->get(['tweets.id', 'tweets.user_id', 'tweets.body', 'tweets.like_count', 'tweets.created_at']);
            }
        );

        return response()->json(['data' => $tweets, 'hot' => $isHot]);
    }
}
