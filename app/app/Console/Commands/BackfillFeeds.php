<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Seeds each user's fanout inbox (feed:{id}) from posts that already exist.
 *
 * Fanout only ever delivers posts made *after* it was switched on, so without
 * this every inbox starts empty and the read path shows almost nothing. Real
 * systems run the same job when enabling fanout, and again whenever someone
 * follows a new account.
 *
 * Idempotent: an inbox is rebuilt from scratch, so re-running cannot duplicate.
 */
class BackfillFeeds extends Command
{
    protected $signature = 'feeds:backfill
        {--per-user=50 : How many posts to seed into each inbox}
        {--users= : Only backfill the first N users (by id)}
        {--only= : Comma-separated user ids, e.g. --only=1685,5720}';

    protected $description = 'Seed fanout inboxes from existing posts';

    public function handle(): int
    {
        $perUser = max(1, (int) $this->option('per-user'));

        $query = DB::table('users')->orderBy('id');

        if ($only = $this->option('only')) {
            $ids = array_filter(array_map('intval', explode(',', $only)));
            $query->whereIn('id', $ids);
        } elseif ($limit = $this->option('users')) {
            $query->limit((int) $limit);
        }

        $userIds = $query->pluck('id');

        if ($userIds->isEmpty()) {
            $this->warn('No users matched.');
            return self::SUCCESS;
        }

        $this->info("Backfilling {$userIds->count()} inbox(es) with up to {$perUser} posts each...");

        $redis = Redis::connection('default');
        $bar = $this->output->createProgressBar($userIds->count());
        $bar->start();

        $seeded = 0;
        $empty = 0;
        $started = microtime(true);

        foreach ($userIds as $userId) {
            $rows = $this->timelineFor($userId, $perUser);
            $key = "feed:{$userId}";

            // Rebuild rather than append, so the command is safe to re-run.
            $redis->del($key);

            if (empty($rows)) {
                $empty++;
                $bar->advance();
                continue;
            }

            // The inbox convention is rPush with the newest at the tail, so the
            // rows (newest first) go in reversed.
            $payloads = array_map(
                fn ($row) => json_encode($this->toPayload($row)),
                array_reverse($rows)
            );

            // One round trip per user instead of one per post.
            $redis->pipeline(function ($pipe) use ($key, $payloads) {
                foreach ($payloads as $payload) {
                    $pipe->rPush($key, $payload);
                }
            });

            $seeded += count($payloads);
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        $elapsed = round(microtime(true) - $started, 1);
        $this->info("Seeded {$seeded} post(s) across {$userIds->count()} inbox(es) in {$elapsed}s.");

        if ($empty > 0) {
            $this->line("{$empty} user(s) had nothing to seed (they follow nobody who has posted).");
        }

        return self::SUCCESS;
    }

    /** Same shape the timeline returns, including this viewer's own flags. */
    private function timelineFor(int $userId, int $limit): array
    {
        return DB::table('tweets')
            ->join('follows', 'follows.followed_id', '=', 'tweets.user_id')
            ->join('users', 'users.id', '=', 'tweets.user_id')
            ->leftJoin('likes', function ($join) use ($userId) {
                $join->on('likes.tweet_id', '=', 'tweets.id')
                    ->where('likes.user_id', '=', $userId);
            })
            ->leftJoin('reposts', function ($join) use ($userId) {
                $join->on('reposts.tweet_id', '=', 'tweets.id')
                    ->where('reposts.user_id', '=', $userId);
            })
            ->where('follows.follower_id', $userId)
            ->whereNull('tweets.parent_tweet_id')
            ->orderByDesc('tweets.created_at')
            ->orderByDesc('tweets.id')
            ->limit($limit)
            ->get([
                'tweets.id',
                'tweets.user_id',
                'users.name as author_name',
                'users.username as author_handle',
                'tweets.body',
                'tweets.like_count',
                'tweets.repost_count',
                'tweets.reply_count',
                'tweets.view_count',
                'tweets.share_count',
                'tweets.created_at',
                DB::raw('(likes.id IS NOT NULL) as liked_by_viewer'),
                DB::raw('(reposts.id IS NOT NULL) as reposted_by_viewer'),
            ])
            ->all();
    }

    private function toPayload(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'user_id' => (int) $row->user_id,
            'author_name' => $row->author_name,
            'author_handle' => $row->author_handle,
            'body' => $row->body,
            'like_count' => (int) $row->like_count,
            'repost_count' => (int) $row->repost_count,
            'reply_count' => (int) $row->reply_count,
            'view_count' => (int) $row->view_count,
            'share_count' => (int) $row->share_count,
            'liked_by_viewer' => (bool) $row->liked_by_viewer,
            'reposted_by_viewer' => (bool) $row->reposted_by_viewer,
            'created_at' => $row->created_at,
        ];
    }
}
