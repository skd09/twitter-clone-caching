<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Order matters.
     *
     * TimelineSeeder generates the dataset the labs measure: 10,000 users,
     * ~1,000,000 tweets and ~2,000,000 follows. HumanizeContentSeeder only ever
     * UPDATEs those rows -- it creates nothing -- so it has to run second or it
     * has nothing to rewrite.
     *
     * No "Test User" is created here: TimelineSeeder assumes user ids start at 1,
     * and an extra row ahead of it shifts every id by one.
     */
    public function run(): void
    {
        $this->call([
            TimelineSeeder::class,
            HumanizeContentSeeder::class,
        ]);
    }
}
