<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Engagement actions behind the tweet card: repost, reply, view and share.
 *
 * Two deliberately different consistency strategies live here:
 *
 *  - repost and reply are WRITE-THROUGH. They are low-volume, user-visible and
 *    must not be lost, so Postgres is written synchronously and its unique
 *    constraint is the authority. Redis only short-circuits the duplicate check,
 *    the same accelerator pattern TweetController::like() uses.
 *
 *  - view and share are WRITE-BEHIND. They are high-volume and individually
 *    worthless, so they are buffered in Redis and folded into Postgres by
 *    `php artisan engagement:flush`. Losing a few on an unclean shutdown is an
 *    accepted trade, exactly as in the lab 3 likes buffer.
 */
class TweetEngagementController extends Controller
{
    /** How long a viewer is remembered as having seen a post. */
    private const VIEW_MEMORY_SECONDS = 86400;

    public function repost(int $tweetId, Request $request)
    {
        $userId = $request->input('user_id');

        if (!$userId) {
            return response()->json(['error' => 'User ID is required'], 422);
        }

        if (!DB::table('tweets')->where('id', $tweetId)->exists()) {
            return response()->json(['error' => 'Tweet not found'], 404);
        }

        $repostedByKey = "tweet:{$tweetId}:reposted_by";

        // Fast path: Redis already knows, so no DB round-trip.
        if (Redis::sIsMember($repostedByKey, $userId)) {
            return response()->json(['error' => 'User has already reposted this tweet'], 409);
        }

        try {
            DB::table('reposts')->insert([
                'user_id' => $userId,
                'tweet_id' => $tweetId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // 23505 = unique_violation. Redis missed it, so backfill for next time.
            if ($e->getCode() === '23505') {
                Redis::sAdd($repostedByKey, $userId);
                return response()->json(['error' => 'User has already reposted this tweet'], 409);
            }
            throw $e;
        }

        Redis::sAdd($repostedByKey, $userId);
        DB::table('tweets')->where('id', $tweetId)->increment('repost_count');

        return response()->json([
            'tweet_id' => $tweetId,
            'repost_count' => (int) DB::table('tweets')->where('id', $tweetId)->value('repost_count'),
            'reposted' => true,
        ]);
    }

    public function unrepost(int $tweetId, Request $request)
    {
        $userId = $request->input('user_id');

        if (!$userId) {
            return response()->json(['error' => 'User ID is required'], 422);
        }

        $deleted = DB::table('reposts')
            ->where('tweet_id', $tweetId)
            ->where('user_id', $userId)
            ->delete();

        // Clear the accelerator whether or not a row existed, so Redis can never
        // outlive the row it was standing in for.
        Redis::sRem("tweet:{$tweetId}:reposted_by", $userId);

        if ($deleted === 0) {
            return response()->json(['error' => 'User has not reposted this tweet'], 409);
        }

        // Guarded so a double-delete race can never drive the counter negative
        // (repost_count is an unsigned column).
        DB::table('tweets')
            ->where('id', $tweetId)
            ->where('repost_count', '>', 0)
            ->decrement('repost_count');

        return response()->json([
            'tweet_id' => $tweetId,
            'repost_count' => (int) DB::table('tweets')->where('id', $tweetId)->value('repost_count'),
            'reposted' => false,
        ]);
    }

    public function reply(int $tweetId, Request $request)
    {
        $userId = $request->input('user_id');
        $body = trim((string) $request->input('body', ''));

        if (!$userId) {
            return response()->json(['error' => 'User ID is required'], 422);
        }

        if ($body === '') {
            return response()->json(['error' => 'Reply body is required'], 422);
        }

        // tweets.body is varchar(200); reject here rather than letting PG truncate.
        if (mb_strlen($body) > 200) {
            return response()->json(['error' => 'Reply must be 200 characters or fewer'], 422);
        }

        if (!DB::table('tweets')->where('id', $tweetId)->exists()) {
            return response()->json(['error' => 'Tweet not found'], 404);
        }

        $reply = DB::transaction(function () use ($tweetId, $userId, $body) {
            $replyId = DB::table('tweets')->insertGetId([
                'user_id' => $userId,
                'parent_tweet_id' => $tweetId,
                'body' => $body,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('tweets')->where('id', $tweetId)->increment('reply_count');

            return DB::table('tweets')->where('id', $replyId)->first();
        });

        return response()->json([
            'tweet_id' => $tweetId,
            'reply_count' => (int) DB::table('tweets')->where('id', $tweetId)->value('reply_count'),
            'reply' => $reply,
        ], 201);
    }

    /**
     * A view is deduplicated per viewer: scrolling the same post past your
     * screen again, or reloading the page, must not inflate the count.
     *
     * The seen-set is keyed by viewer rather than by tweet -- one key per user
     * instead of one per tweet, which is three orders of magnitude fewer keys on
     * this dataset. Without a user_id the request still counts, since an
     * anonymous impression has nothing to deduplicate against.
     */
    public function view(int $tweetId, Request $request)
    {
        $userId = $request->input('user_id');

        if ($userId) {
            $seenKey = "viewer:{$userId}:viewed";

            if (Redis::sIsMember($seenKey, $tweetId)) {
                return response()->json(
                    $this->readCount($tweetId, 'views', 'view_count', false)
                );
            }

            Redis::sAdd($seenKey, $tweetId);
            Redis::expire($seenKey, self::VIEW_MEMORY_SECONDS);
        }

        return response()->json($this->buffer($tweetId, 'views', 'view_count'));
    }

    public function share(int $tweetId)
    {
        return response()->json($this->buffer($tweetId, 'shares', 'share_count'));
    }

    /**
     * Write-behind increment. The returned total is the durable column plus the
     * not-yet-flushed Redis buffer, so a caller never sees the number go
     * backwards just because a flush has not run.
     */
    private function buffer(int $tweetId, string $bucket, string $column): array
    {
        $pending = (int) Redis::incr("tweet:{$tweetId}:pending_{$bucket}");
        Redis::sAdd("tweet:with_pending_{$bucket}", $tweetId);

        $stored = (int) DB::table('tweets')->where('id', $tweetId)->value($column);

        return [
            'tweet_id' => $tweetId,
            $column => $stored + $pending,
            'buffered' => $pending,
            'counted' => true,
        ];
    }

    /** Same shape as buffer(), but reads the total without incrementing it. */
    private function readCount(int $tweetId, string $bucket, string $column, bool $counted): array
    {
        $pending = (int) (Redis::get("tweet:{$tweetId}:pending_{$bucket}") ?? 0);
        $stored = (int) DB::table('tweets')->where('id', $tweetId)->value($column);

        return [
            'tweet_id' => $tweetId,
            $column => $stored + $pending,
            'buffered' => $pending,
            'counted' => $counted,
        ];
    }
}
