<?php

namespace App\Metrics;

use Illuminate\Support\Facades\Redis;

class MetricsCollector
{
    public function increment(string $name, array $labels = [], int $by = 1): void
    {
        Redis::connection('default')->hIncrBy('metrics', $this->fieldName($name, $labels), $by);
    }

    public function get(string $name, array $labels = []): int
    {
        return (int) Redis::connection('default')->hGet('metrics', $this->fieldName($name, $labels));
    }

    private function fieldName(string $name, array $labels): string
    {
        if (empty($labels)) {
            return $name;
        }

        ksort($labels);

        $pairs = [];
        foreach ($labels as $key => $value) {
            $pairs[] = "{$key}=\"{$value}\"";
        }

        return $name . '{' . implode(',', $pairs) . '}';
    }
}
