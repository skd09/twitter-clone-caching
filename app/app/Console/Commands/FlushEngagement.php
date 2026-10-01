<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Write-behind flush for the high-volume counters, mirroring likes:flush.
 * Views and shares are buffered in Redis by TweetEngagementController and folded
 * into Postgres here.
 */
class FlushEngagement extends Command
{
    protected $signature = 'engagement:flush';
    protected $description = 'Flush buffered views and shares from Redis into Postgres';

    /** Redis bucket => tweets column. */
    private const BUCKETS = [
        'views' => 'view_count',
        'shares' => 'share_count',
    ];

    public function handle()
    {
        $total = 0;

        foreach (self::BUCKETS as $bucket => $column) {
            $tweetIds = Redis::sMembers("tweet:with_pending_{$bucket}");

            if (empty($tweetIds)) {
                $this->info("No pending {$bucket}.");
                continue;
            }

            foreach ($tweetIds as $tweetId) {
                // getDel so a concurrent increment lands in the next flush rather
                // than being wiped by this one.
                $pending = Redis::getDel("tweet:{$tweetId}:pending_{$bucket}");

                if ($pending) {
                    DB::table('tweets')->where('id', $tweetId)->increment($column, (int) $pending);
                }

                Redis::sRem("tweet:with_pending_{$bucket}", $tweetId);
            }

            $this->info('Flushed ' . count($tweetIds) . " tweet(s) for {$bucket}.");
            $total += count($tweetIds);
        }

        $this->info("Done. {$total} counter update(s) applied.");
    }
}
