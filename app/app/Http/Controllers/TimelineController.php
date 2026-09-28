<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TimelineController extends Controller
{
    public function show(int $userId)
    {
        $tweets = DB::table('tweets')
            ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
            ->where('follows.follower_id', $userId)
            ->orderByDesc('tweets.created_at')
            ->limit(20)
            ->get(['tweets.id', 'tweets.user_id', 'tweets.body', 'tweets.like_count', 'tweets.created_at']);

        return response()->json(['data' => $tweets]);
    }
}
