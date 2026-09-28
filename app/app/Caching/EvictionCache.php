<?php

namespace App\Caching;

interface EvictionCache
{
    public function get(string $key): mixed; // returns null on miss
    public function put(string $key, mixed $value): void;
    public function capacity(): int;
    public function size(): int;
}