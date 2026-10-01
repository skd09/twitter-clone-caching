<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tweets', function (Blueprint $table) {
            // Denormalised counters, same shape as the existing like_count.
            $table->unsignedInteger('repost_count')->default(0)->after('like_count');
            $table->unsignedInteger('reply_count')->default(0)->after('repost_count');
            $table->unsignedInteger('view_count')->default(0)->after('reply_count');
            $table->unsignedInteger('share_count')->default(0)->after('view_count');

            // A reply is a tweet that points at its parent.
            $table->foreignId('parent_tweet_id')
                ->nullable()
                ->after('user_id')
                ->constrained('tweets')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tweets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_tweet_id');
            $table->dropColumn([
                'repost_count',
                'reply_count',
                'view_count',
                'share_count',
            ]);
        });
    }
};
