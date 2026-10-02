<?php

namespace App\Metrics;

use Illuminate\Support\Facades\Redis;

class MetricsCollector
{
    public function increment(string $metric, array $labels = []): void
    {
        $key = $this->buildKey($metric, $labels);
        Redis::connection('default')->incr("metrics:{$key}");
    }

    public function get(string $metric, array $labels = []): int
    {
        $key = $this->buildKey($metric, $labels);
        return (int) Redis::connection('default')->get("metrics:{$key}");
    }

    public function allKeys(): array
    {
        $keys = Redis::connection('default')->keys('*metrics:*');
        return array_map(fn($k) => preg_replace('/^.*metrics:/', '', $k), $keys);
    }

    private function buildKey(string $metric, array $labels): string
    {
        if(empty($labels)) {
            return $metric;
        }

        ksort($labels);
        $labelString = collect($labels)->map(fn($v, $k) => "{$k}={$v}")->implode(',');

        return "{$metric}:{$labelString}";
    }
}