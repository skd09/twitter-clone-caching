<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Replaces the placeholder "User 1685" / "Tweet number 433330" content with
 * realistic English names and post bodies.
 *
 * Rewrites in place: no rows are inserted or deleted, no ids change, and
 * created_at/updated_at are left untouched so the lab 7 version-check and every
 * existing benchmark still see the same dataset shape. Content is chosen by a
 * deterministic function of the row id, so re-running produces the same result.
 */
class HumanizeContentSeeder extends Seeder
{
    private const FIRST_NAMES = [
        'Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Isla', 'Lucas',
        'Maya', 'Oliver', 'Ruby', 'Leo', 'Nina', 'Caleb', 'Iris', 'Owen',
        'Elena', 'Jonah', 'Clara', 'Felix', 'Tessa', 'Milo', 'Rosa', 'Hugo',
        'Freya', 'Dean', 'Lena', 'Arlo', 'Sage', 'Theo', 'Juno', 'Reed',
        'Priya', 'Omar', 'Anika', 'Kai', 'Nadia', 'Jasper', 'Leila', 'Ezra',
        'Simone', 'Rohan', 'Daphne', 'Idris', 'Marta', 'Silas', 'Wren', 'Amos',
        'Carmen', 'Linus', 'Opal', 'Dmitri', 'Esme', 'Rafael', 'Thea', 'Gideon',
        'Lucia', 'Anton', 'Norah', 'Keane', 'Vera', 'Soren', 'Greta', 'Emil',
    ];

    private const LAST_NAMES = [
        'Hart', 'Nolan', 'Reyes', 'Okafor', 'Lindqvist', 'Barnes', 'Moreau', 'Chen',
        'Alvarez', 'Fenwick', 'Doyle', 'Nakamura', 'Whitfield', 'Osei', 'Kaur', 'Bellini',
        'Harper', 'Vance', 'Kowalski', 'Mensah', 'Rivera', 'Thornton', 'Ibarra', 'Sloane',
        'Draper', 'Ferreira', 'Quinn', 'Adeyemi', 'Larsen', 'Mercer', 'Patel', 'Novak',
        'Bright', 'Castillo', 'Dunne', 'Eriksen', 'Fontaine', 'Gallagher', 'Holloway', 'Iqbal',
        'Jensen', 'Keller', 'Lombardi', 'Marsh', 'Nguyen', 'Oyelaran', 'Pruitt', 'Rask',
        'Sandoval', 'Tilley', 'Underwood', 'Varga', 'Walsh', 'Yates', 'Zamora', 'Abbott',
        'Byrne', 'Calloway', 'Delgado', 'Ellery', 'Finch', 'Granger', 'Hale', 'Ingram',
    ];

    /** 160 complete posts; varied enough that a 20-row feed rarely repeats. */
    private const POSTS = [
        'Spent the morning rewriting a function I wrote last year and finally understand what it was doing.',
        'The best debugging tool is still a good night of sleep.',
        'Hot take: the hardest part of caching is deciding when to throw things away.',
        'Three hours chasing a bug that turned out to be a trailing space.',
        'Finally got the deploy pipeline down to under four minutes.',
        'Reading old code is just archaeology with worse documentation.',
        'Every config file eventually becomes a programming language.',
        'Wrote tests first today and it genuinely saved me twice.',
        'The database was never the bottleneck. It was me.',
        'Nothing humbles you like explaining your own architecture out loud.',
        'My favourite refactor is the one that deletes more than it adds.',
        'Learned more from one failed migration than a month of tutorials.',
        'Caching is easy until you need to invalidate anything.',
        'The staging environment lied to me again.',
        'Shipped something small today and it felt better than shipping something big last month.',
        'A good error message is worth ten pages of documentation.',
        'Spent longer naming the variable than writing the function.',
        'Turns out the race condition was in my head too.',
        'Why does every performance problem end in a missing index.',
        'Rewrote it in half the lines and it reads twice as well.',
        'Morning run done before the sun came up. Highly recommend.',
        'The coffee shop on the corner finally fixed their wifi.',
        'Made bread from scratch for the first time. It is edible.',
        'Nothing beats a long walk with no particular destination.',
        'Reorganised my desk and suddenly I can think again.',
        'The weather turned overnight and I am not ready for it.',
        'Found an old notebook full of ideas I completely forgot about.',
        'Cooked dinner for friends and nobody looked at their phone once.',
        'The library near my flat has the best quiet corner in the city.',
        'Started learning to play again after a decade away from it.',
        'Cold morning, warm jacket, empty streets. Perfect.',
        'My plants are thriving and I take full credit.',
        'Watched the sunset from the roof. Worth climbing the stairs.',
        'Sometimes the answer is just to go outside for ten minutes.',
        'Repainted the kitchen and now everything else looks shabby.',
        'The market had actual ripe tomatoes today. Rare win.',
        'Slept nine hours and feel like a different person.',
        'Tried a new route home and found a bookshop I never knew existed.',
        'Finished a book in one sitting. Forgot how good that feels.',
        'The neighbours got a puppy and the whole building is happier.',
        'Second half was a completely different game.',
        'That was the best match I have watched all season.',
        'Still think the referee got that one wrong.',
        'Came back from two down with ten minutes left. Unbelievable.',
        'The new signing is already worth every penny.',
        'Watched the whole thing through my fingers.',
        'Never doubted them. Obviously lying, but never doubted them.',
        'Tickets sold out in eleven minutes. Eleven.',
        'That goal will be replayed for years.',
        'A draw felt fair but I will still complain about it.',
        'The album is better than I expected and I expected a lot.',
        'Went to a tiny gig last night and the sound was perfect.',
        'Three songs in and the whole room was singing.',
        'Rediscovered a record I had not played since school.',
        'There is a particular joy in a playlist that actually flows.',
        'New headphones and suddenly I hear things I missed for years.',
        'Saw a band with four people in the audience. They played like it was four thousand.',
        'The soundtrack is doing most of the heavy lifting in that film.',
        'Learning an instrument as an adult is an exercise in patience.',
        'Vinyl is inconvenient and I love it anyway.',
        'Trains delayed again. Writing this from a platform bench.',
        'Finally booked the trip I have been talking about for a year.',
        'Airport at five in the morning is its own kind of quiet.',
        'Got lost on purpose and it was the best afternoon of the trip.',
        'The view from the top was worth every one of those steps.',
        'Packed too much. I always pack too much.',
        'Small town, one bakery, absolutely perfect.',
        'Missed the connection and ended up somewhere better.',
        'Twelve hours of travel and I would do it again tomorrow.',
        'Home again, and the plants survived.',
        'Deleted an app and immediately felt lighter.',
        'The hardest part of any project is starting it on a Tuesday.',
        'Wrote down the problem and solved it in the writing.',
        'Saying no to one thing made room for three better ones.',
        'Procrastinated so effectively I reorganised the entire cupboard.',
        'Turns out I work better in ninety minute blocks.',
        'Took a real lunch break and the afternoon was twice as productive.',
        'My to do list has a to do list now.',
        'Closed thirty tabs and felt genuine relief.',
        'The meeting could have been a message. It always could have been.',
        'Made a spreadsheet to decide something and then ignored it entirely.',
        'Started early, finished early, walked home in daylight.',
        'Asked for help two weeks later than I should have.',
        'Blocked out the morning for deep work and actually defended it.',
        'Rest is part of the work. Still learning that one.',
        'The first draft is supposed to be bad. That is the whole point.',
        'Printed it out and found four mistakes in ninety seconds.',
        'Explaining it to someone else is how I find the gaps.',
        'Kept the scope small and actually finished for once.',
        'Perfect is doing a lot of damage to good around here.',
        'Tried the new place down the road and it lived up to the queue.',
        'Nothing wrong with eating the same breakfast every day.',
        'Made too much soup. No regrets, only leftovers.',
        'The secret is more salt than you think and less heat than you want.',
        'Finally learned to cook the one dish I always order out.',
        'Farmers market haul got slightly out of hand.',
        'Nobody warned me how good a properly sharp knife feels.',
        'Dinner was twenty minutes and tasted like an hour.',
        'Burnt the first batch. The second batch was perfect.',
        'There is no bad weather for soup.',
        'The documentation was right and I was wrong.',
        'Read the stack trace. Actually read it. All of it.',
        'Reproduced it locally and it stopped being scary.',
        'Logged the thing I assumed and the assumption was wrong.',
        'Binary search through the commits found it in nine minutes.',
        'Fixed the symptom first, then went back for the cause.',
        'The bug was real. My explanation for it was not.',
        'Rolled back, slept, fixed it properly in the morning.',
        'Measured before optimising and saved myself a week.',
        'Added one log line and the whole thing became obvious.',
        'The monitoring caught it before any user did. Good day.',
        'Wrote the postmortem and learned more writing it than fixing it.',
        'Two systems disagreed about what time it was. Classic.',
        'It worked on the third try and I still do not fully know why.',
        'Reverted my own clever solution for something boring and correct.',
        'Boring technology keeps being the right answer.',
        'Spent the afternoon deleting dead code. Deeply satisfying.',
        'The feature nobody asked for is the one everybody uses.',
        'Simple is harder than clever and worth it every time.',
        'Shipped it behind a flag and slept fine.',
        'Good architecture is mostly knowing what to leave out.',
        'The old system was ugly and it worked for nine years.',
        'Every abstraction has a bill and it always arrives later.',
        'Wrote it twice. The second one was the real one.',
        'Named things badly, lived with it, renamed everything today.',
        'The review caught something I would have missed for months.',
        'Pair programming for an hour saved two days.',
        'Disagreed, committed, and it turned out fine.',
        'Asked the obvious question and nobody else had either.',
        'The best feedback I got this year was three sentences long.',
        'Mentoring someone taught me what I actually know.',
        'Said I did not understand and the whole meeting got better.',
        'Documented the thing while it was still fresh. Past me is a hero.',
        'Handed it over cleanly and that felt better than building it.',
        'Credit went to the team and that is exactly right.',
        'Left better notes than I found. Low bar, still counts.',
        'Rewrote the onboarding doc after watching someone struggle with it.',
        'Finally understood monads. Ask me tomorrow and I will have lost it.',
        'Learning in public is terrifying and worth it.',
        'The tutorial lied by omission and I learned more for it.',
        'Took notes by hand and remembered twice as much.',
        'Rebuilt it from scratch just to understand how it worked.',
        'Watched a talk from six years ago that is still completely relevant.',
        'The fundamentals keep paying rent.',
        'Taught it badly, then taught it well, then understood it.',
        'Bought the book, read the first chapter, already worth it.',
        'Changed my mind about something I argued for last year.',
        'Being wrong quickly is cheaper than being right slowly.',
        'First frost this morning and everything looked new.',
        'The days are getting shorter and I am making peace with it.',
        'Rain all weekend and I did not mind one bit.',
        'Opened the window and the whole room changed.',
        'The light at this time of year is absurdly good.',
        'Walked to work and arrived in a completely different mood.',
        'Snow is only magical for the first day and I will take it.',
        'Spring is doing that thing where it arrives three times.',
        'Sat outside for lunch for the first time in months.',
        'The garden is a disaster and I am oddly proud of it.',
        'Everything is quieter after it rains.',
        'Long summer evenings are the whole reason for summer.',
        'Woke up before the alarm and watched the sky change.',
        'The sea was freezing and I went in anyway.',
        'Autumn smells better than any other season and I will not debate this.',
    ];

    /** Occasional tails, mostly empty, to widen the variant space. */
    private const TAILS = [
        '', '', '', '', '', '', '',
        ' Anyway, back to it.',
        ' Small win.',
        ' Still thinking about it.',
        ' #buildinpublic',
        ' #devlife',
        ' Long overdue.',
        ' Would recommend.',
        ' Lesson learned.',
        ' More soon.',
    ];

    public function run(): void
    {
        $this->rewriteUsers();
        $this->rewriteTweets();
        $this->backfillEngagement();
        $this->command->info('Done. Remember to clear the timeline caches.');
    }

    /**
     * like_count arrived with the original seed; repost/reply/view/share were
     * added later and defaulted to 0, which left tweets showing 35 likes and 1
     * view. This derives the newer counters from like_count using roughly
     * real-world ratios, so a card reads plausibly.
     *
     * Deterministic in the row id, so re-running is idempotent. Counters are
     * denormalised: the likes/reposts join tables still hold only genuine user
     * actions, and reply_count is topped up with the real child rows afterwards.
     */
    private function backfillEngagement(): void
    {
        $this->command->info('Backfilling engagement counters from like_count...');

        // Views run 60-200x likes with noise, and never sit at zero -- a post can
        // be seen without being liked. Reposts/replies/shares are percentages.
        DB::statement(
            'UPDATE tweets SET
                view_count = GREATEST(
                    like_count * (60 + (id % 140)) + (id % 997),
                    20 + (id % 400)
                ),
                repost_count = (like_count * (8 + (id % 22))) / 100,
                reply_count  = (like_count * (3 + (id % 12))) / 100,
                share_count  = (like_count * (2 + (id %  9))) / 100
             WHERE parent_tweet_id IS NULL'
        );

        // Keep the counter honest about replies that actually exist.
        DB::statement(
            'UPDATE tweets p
             SET reply_count = p.reply_count + c.actual
             FROM (
                 SELECT parent_tweet_id, COUNT(*) AS actual
                 FROM tweets
                 WHERE parent_tweet_id IS NOT NULL
                 GROUP BY parent_tweet_id
             ) c
             WHERE p.id = c.parent_tweet_id'
        );
    }

    private function rewriteUsers(): void
    {
        $firsts = count(self::FIRST_NAMES);
        $lasts = count(self::LAST_NAMES);

        $this->command->info("Rewriting user names ({$firsts}x{$lasts} combinations)...");

        DB::statement(sprintf(
            "UPDATE users SET
                name = f.arr[(users.id %% %d) + 1] || ' ' || l.arr[((users.id / %d) %% %d) + 1],
                username = lower(f.arr[(users.id %% %d) + 1]) || lower(l.arr[((users.id / %d) %% %d) + 1]) || users.id
             FROM (SELECT %s AS arr) f, (SELECT %s AS arr) l",
            $firsts, $firsts, $lasts,
            $firsts, $firsts, $lasts,
            $this->pgArray(self::FIRST_NAMES),
            $this->pgArray(self::LAST_NAMES)
        ));
    }

    private function rewriteTweets(): void
    {
        $posts = count(self::POSTS);
        $tails = count(self::TAILS);

        $this->command->info("Rewriting tweet bodies ({$posts}x{$tails} variants)...");

        // Replies are left alone: they carry content someone actually wrote.
        DB::statement(sprintf(
            "UPDATE tweets SET body = p.arr[(tweets.id %% %d) + 1] || t.arr[((tweets.id / %d) %% %d) + 1]
             FROM (SELECT %s AS arr) p, (SELECT %s AS arr) t
             WHERE tweets.parent_tweet_id IS NULL",
            $posts, $posts, $tails,
            $this->pgArray(self::POSTS),
            $this->pgArray(self::TAILS)
        ));
    }

    /** Builds a Postgres text[] literal from static, developer-authored strings. */
    private function pgArray(array $values): string
    {
        $quoted = array_map(
            fn (string $v) => "'" . str_replace("'", "''", $v) . "'",
            $values
        );

        return 'ARRAY[' . implode(',', $quoted) . ']::text[]';
    }
}
