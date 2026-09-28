<?php

namespace App\Caching;

class FifoCache implements EvictionCache
{
    private array $store = [];

    public function __construct(private int $capacity)
    {

    }

    public function get(string $key): mixed
    {
        if(!array_key_exists($key, $this->store)) {
            return null;
        }

        return $this->store[$key];
    }

    public function put(string $key, mixed $value): void
    {
        if (array_key_exists($key, $this->store)) {
            // Key already exists, just update its value
            $this->store[$key] = $value;
            return;
        }        

        if ($this->size() >= $this->capacity()) {
            // Evict the oldest key (FIFO)
            array_shift($this->store);
        }

        // Insert the new key-value pair
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