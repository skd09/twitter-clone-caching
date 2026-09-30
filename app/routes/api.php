<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TimelineController;
use App\Http\Controllers\TweetController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/users/{userId}/timeline', [TimelineController::class, 'show']);

Route::post('/tweets/{tweetId}/like', [\App\Http\Controllers\TweetController::class, 'like']);
Route::post('/tweets/{tweetId}/like-buffered', [TweetController::class, 'likeBuffered']);
Route::get('/tweets/{tweetId}/read-slow', [TweetController::class, 'readLikesSlow']);

