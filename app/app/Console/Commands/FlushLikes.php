<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class FlushLikes extends Command
{
    protected $signature = 'likes:flush';
    protected $description = 'Flush buffered likes from Redis into Postgres';

    public function handle()
    {
        $tweetIds = Redis::sMembers('tweet:with_pending_likes');

        if (empty($tweetIds)) {
            $this->info('Nothing to flush.');
            return;
        }

        foreach ($tweetIds as $tweetId) {
            $pending = Redis::getDel("tweet:{$tweetId}:pending_likes");

            if ($pending) {
                DB::table('tweets')->where('id', $tweetId)->increment('like_count', (int) $pending);
            }

            Redis::sRem('tweet:with_pending_likes', $tweetId);
        }

        $this->info('Flushed ' . count($tweetIds) . ' tweet(s).');
    }
}
