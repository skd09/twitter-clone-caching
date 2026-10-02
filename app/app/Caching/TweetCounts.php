<?php

namespace App\Caching;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class TweetCounts
{
    public const FIELDS = ['like_count', 'repost_count', 'reply_count', 'view_count', 'share_count'];

    private const TTL = 60; // seconds

    /**
     * Bump one counter, but only if the hash is already cached.
     * If it isn't, the next read rebuilds it from Postgres, so a bump
     * here would only create a half-empty hash.
     */
    public function bump(int $tweetId, string $field, int $delta = 1): void
    {
        $script = <<< 'LUA'
            if redis.call('EXISTS', KEYS[1]) == 1 then
                return redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
            end
        LUA;

        Redis::connection('default')->eval($script, 1, "tweet:{$tweetId}:counts", $field, $delta);
    }

    /** Returns [tweetId => [field => int]] for every id asked for. */
    public function many(array $tweetIds): array
    {
        $tweetIds = array_values(array_unique($tweetIds));
        $conn = Redis::connection('default');

        $replicas = $conn->pipeline(function ($pipe) use ($tweetIds) {
            foreach ($tweetIds as $tweetId) {
                $pipe->hMGet("tweet:{$tweetId}:counts", self::FIELDS);
            }
        });

        $counts = [];
        $missing = [];

        foreach ($tweetIds as $i => $id) {
            $row = $replicas[$i] ?? null;

            if (is_array($row) && !in_array(false, $row, true)) {
                $counts[$id] = array_map('intval', $row);
            } else {
                $missing[] = $id;
            }
        }

        if ($missing) {
            $rows = DB::table('tweets')
                ->whereIn('id', $missing)
                ->get(array_merge(['id'], self::FIELDS));

            // Views and shares are write-behind, so some may still be sitting in Redis.
            $pending = $conn->pipeline(function ($pipe) use ($missing) {
                foreach ($missing as $id) {
                    $pipe->get("tweet:{$id}:pending_views");
                    $pipe->get("tweet:{$id}:pending_shares");
                }
            });

            $pendingById = [];
            foreach ($missing as $i => $id) {
                // two commands per tweet, so tweet number $i owns replies 2*$i and 2*$i+1
                $pendingById[$id] = [
                    'view_count'  => (int) ($pending[$i * 2] ?? 0),
                    'share_count' => (int) ($pending[$i * 2 + 1] ?? 0),
                ];
            }

            $conn->pipeline(function ($pipe) use ($rows, $pendingById, &$counts) {
                foreach ($rows as $row) {
                    $fields = [];
                    foreach (self::FIELDS as $field) {
                        $fields[$field] = (int) $row->$field + ($pendingById[$row->id][$field] ?? 0);
                    }
                    $counts[$row->id] = $fields;

                    $key = "tweet:{$row->id}:counts";
                    $pipe->hMSet($key, $fields);
                    $pipe->expire($key, self::TTL);
                }
            });
        }

        return $counts;
    }
}