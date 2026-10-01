<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use App\Caching\HotKeyDetector;
use Illuminate\Support\Facades\Redis;

class TimelineController extends Controller
{
    public function show(int $userId, HotKeyDetector $detector)
    {
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
            $tweets = Cache::remember($cacheKey, now()->addSeconds($ttl), function () use ($userId) {
                return $this->fetchTimeline($userId);
            });
        }

        return response()->json(['data' => $tweets, 'hot' => $isHot, 'redis' => $isHot ? 'hot-server' : 'cold-server']);
    }

    private function fetchTimeline(int $userId)
    {
        Log::info("DB QUERY RAN for user {$userId}");

        return DB::table('tweets')
            ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
            ->where('follows.follower_id', $userId)
            ->orderByDesc('tweets.created_at')
            ->limit(20)
            ->get(['tweets.id', 'tweets.user_id', 'tweets.body', 'tweets.like_count', 'tweets.created_at']);
    }

    private function rememberOnHotRedis(string $key, int $ttl, callable $callback)
    {
        $cached = Redis::connection('hot')->get($key);
        if($cached !== null) {
            return json_decode($cached, true);     
        }

        $value = $callback();
        Redis::connection('hot')->setEx($key, $ttl, json_encode($value));
        return $value;
    }
}
