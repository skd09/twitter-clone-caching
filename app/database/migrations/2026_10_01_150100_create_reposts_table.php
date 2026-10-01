<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reposts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tweet_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            // Postgres is the authority on uniqueness; Redis is only an accelerator.
            $table->unique(['user_id', 'tweet_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reposts');
    }
};
