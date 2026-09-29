<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class TimelineController extends Controller
{
    public function show(int $userId)
    {
        $tweets = Cache::remember(
            "timeline:{$userId}",
            now()->addSeconds(10 + random_int(0, 5)),
            function () use ($userId) {
                return DB::table('tweets')
                    ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
                    ->where('follows.follower_id', $userId)
                    ->orderByDesc('tweets.created_at')
                    ->limit(20)
                    ->get(['tweets.id', 'tweets.user_id', 'tweets.body', 'tweets.like_count', 'tweets.created_at']);
            }
        );

        return response()->json(['data' => $tweets]);
    }
}
