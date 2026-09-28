<?php

namespace App\Caching;

class LruCache implements EvictionCache
{
    private array $store = [];

    public function __construct(private int $capacity) {}

    public function get(string $key): mixed
    {
        if(!array_key_exists($key, $this->store)) {
            return null;
        }

        // Move the key to the end (most recently used)
        $value = $this->store[$key];
        unset($this->store[$key]);
        $this->store[$key] = $value;

        return $value;
    }

    public function put(string $key, mixed $value): void
    {

        if (array_key_exists($key, $this->store)) {
            // Key already exists, just update its value and move it to the end
            unset($this->store[$key]);
        } elseif ($this->size() >= $this->capacity()) {
            // Evict the least recently used key (the first one in the array)
            array_shift($this->store);
        }

        // Insert the new key-value pair at the end (most recently used)
        $this->store[$key] = $value;
    }

    public function capacity(): int
    {
        return $this->capacity;
    }

    public function size(): int
    {
        return count($this->store);
    }
}
