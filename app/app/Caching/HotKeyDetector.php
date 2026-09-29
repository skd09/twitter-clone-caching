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
        $countKey = "hotcount:{$key}";
        $count = Redis::incr($countKey);
        if ($count === 1) {
            Redis::expire($countKey, $this->windowSeconds);
        }
        $isHot = $count >= $this->threshold;

        if($isHot){
            Redis::sAdd('hot_keys', $key);
        }

        return $isHot;
    }

    public function isHot(string $key): bool
    {
        return Redis::sismember('hot_keys', $key);
    }
}