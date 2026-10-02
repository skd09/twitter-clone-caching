<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TimelineController;
use App\Http\Controllers\TweetController;
use App\Http\Controllers\TweetEngagementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\MetricsController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/users/{userId}/timeline', [TimelineController::class, 'show']);

Route::post('/tweets/{tweetId}/like', [\App\Http\Controllers\TweetController::class, 'like']);
Route::post('/tweets/{tweetId}/like-buffered', [TweetController::class, 'likeBuffered']);
Route::get('/tweets/{tweetId}/read-slow', [TweetController::class, 'readLikesSlow']);

// Tweet card engagement.
// Write-through (Postgres is the authority):
Route::post('/tweets/{tweetId}/repost', [TweetEngagementController::class, 'repost']);
Route::delete('/tweets/{tweetId}/repost', [TweetEngagementController::class, 'unrepost']);
Route::post('/tweets/{tweetId}/reply', [TweetEngagementController::class, 'reply']);
// Write-behind (buffered in Redis, folded in by `php artisan engagement:flush`):
Route::post('/tweets/{tweetId}/view', [TweetEngagementController::class, 'view']);
Route::post('/tweets/{tweetId}/share', [TweetEngagementController::class, 'share']);
// Fanout to followers (Postgres is the authority):
// Celebrity fanout is skipped
Route::post('/tweets', [TweetController::class, 'store']);

// Demo sign-in: any seeded username, password ignored. Not real auth.
Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/suggestions', [AuthController::class, 'suggestionList']);


Route::get('/metrics', [MetricsController::class, 'index']);