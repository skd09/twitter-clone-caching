<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

class MetricsController extends Controller
{
    public function index()
    {
        $fields = Redis::class::connection('default')->hGetAll('metrics');
        $lines = [];
        foreach ($fields as $name => $value) {
            $lines[] = "{$name} {$value}";
        }
        return response(implode("\n", $lines), 200, ['Content-Type' => 'text/plain; version=0.0.4']);
    }
}
