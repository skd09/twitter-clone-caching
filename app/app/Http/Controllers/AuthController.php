<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Demo sign-in. There is no real authentication here: the password is accepted
 * and discarded so the UI can act as any seeded user. It is never read, hashed,
 * logged or compared -- do not mistake this for an auth system.
 */
class AuthController extends Controller
{
    private const SUGGESTION_IDS = [2, 1, 7, 1685, 5720, 8312];

    public function login(Request $request)
    {
        $handle = $this->normalise((string) $request->input('username', ''));

        if ($handle === '') {
            return response()->json([
                'error' => 'Enter a username',
                'suggestions' => $this->suggestions(),
            ], 422);
        }

        // Cache-aside on the handle lookup. Keyed by handle rather than id, so it
        // is a separate key from user:{id}:profile and cannot collide with it.
        $user = Cache::remember(
            "user:handle:{$handle}",
            now()->addMinutes(5),
            function () use ($handle) {
                $row = DB::table('users')
                    ->when(
                        ctype_digit($handle),
                        fn ($q) => $q->where('id', (int) $handle),
                        fn ($q) => $q->whereRaw('lower(username) = ?', [$handle])
                    )
                    ->first(['id', 'name', 'username']);

                return $row ? (array) $row : null;
            }
        );

        if ($user === null) {
            return response()->json([
                'error' => "No account found for \"{$handle}\"",
                'suggestions' => $this->suggestions(),
            ], 404);
        }

        return response()->json(['user' => $user]);
    }

    public function suggestionList()
    {
        return response()->json(['suggestions' => $this->suggestions()]);
    }

    /** A handful of real accounts, so the sign-in screen is not a guessing game. */
    private function suggestions(): array
    {
        return Cache::remember('user:suggestions', now()->addMinutes(10), function () {
            return DB::table('users')
                ->whereIn('id', self::SUGGESTION_IDS)
                ->get(['id', 'name', 'username'])
                ->map(fn ($row) => (array) $row)
                ->all();
        });
    }

    private function normalise(string $value): string
    {
        return mb_strtolower(ltrim(trim($value), '@'));
    }
}
