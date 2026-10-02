<?php

namespace App\Caching;

use Illuminate\Support\Facades\Redis;

class HotKeyDetector
{
    public function __construct(
        private int $windowSeconds = 10,
        private int $threshold = 20
    ){}

    public function recordAccess(string $key): bool
    {
        // Already known hot? Skip the counter entirely — one cheap read,
        // no write, so a celebrity's steady traffic stops hitting the
        // cold server's INCR on every single request.
        if ($this->isHot($key)) {
            return true;
        }

        $countKey = "hotcount:{$key}";
        $count = Redis::incr($countKey);
        if ($count === 1) {
            Redis::expire($countKey, $this->windowSeconds);
        }
        $isHotNow = $count >= $this->threshold;

        if ($isHotNow) {
            Redis::sAdd('hot_keys', $key);
        }

        // Once a key is flagged hot, stay hot — don't rely only on this window's burst.
        return $isHotNow || $this->isHot($key);
    }

    public function isHot(string $key): bool
    {
        return Redis::sIsMember('hot_keys', $key);
    }
}