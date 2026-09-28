<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TimelineSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DB::unprepared("
            INSERT INTO users (name, email, password, created_at, updated_at)
            SELECT 'User ' || g, 'user' || g || '@example.com', 'not-a-real-hash', now(), now()
            FROM generate_series(1, 10000) g;

            INSERT INTO follows (follower_id, followed_id)
            SELECT DISTINCT f, t FROM (
                SELECT g AS f, (1 + floor(random() * 10000))::int AS t
                FROM generate_series(1, 10000) g, generate_series(1, 200) k
            ) s
            WHERE f <> t
            ON CONFLICT DO NOTHING;

            INSERT INTO follows (follower_id, followed_id)
            SELECT g, 1 FROM generate_series(2, 10000) g
            ON CONFLICT DO NOTHING;

            INSERT INTO tweets (user_id, body, like_count, created_at, updated_at)
            SELECT 1 + floor(random() * 10000)::int, 'Tweet number ' || g,
                floor(random() * 100)::int, ts, ts
            FROM (
                SELECT g, now() - (random() * interval '30 days') AS ts
                FROM generate_series(1, 1000000) g
            ) s;

            ANALYZE;
        ");
    }
}
