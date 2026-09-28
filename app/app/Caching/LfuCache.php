<?php

namespace App\Caching;

class LfuCache implements EvictionCache
{
    private array $store = []; // key => value
    private array $frequencies = []; // key => access count

    public function __construct(private int $capacity) {}

    public function get(string $key): mixed
    {
        if (!array_key_exists($key, $this->store)) {
            return null;
        }

        $this->frequencies[$key]++;

        $value = $this->store[$key];
        unset($this->store[$key]);
        $this->store[$key] = $value;

        return $value;
    }

    public function put(string $key, mixed $value): void
    {
        if (array_key_exists($key, $this->store)) {
            unset($this->store[$key]);
            $this->store[$key] = $value;
            $this->frequencies[$key]++;
            return;
        }

        if ($this->size() >= $this->capacity()) {
            // Evict the key with the lowest frequency. On a tie, evict the one that appears earliest in $this->store.
            $minFrequency = min($this->frequencies);
            $keysWithMinFrequency = array_keys($this->frequencies, $minFrequency);
            $keyToEvict = null;

            foreach ($this->store as $storedKey => $_) {
                if (in_array($storedKey, $keysWithMinFrequency)) {
                    $keyToEvict = $storedKey;
                    break;
                }
            }

            if ($keyToEvict !== null) {
                unset($this->store[$keyToEvict]);
                unset($this->frequencies[$keyToEvict]);
            }
        }

        $this->store[$key] = $value;
        $this->frequencies[$key] = 1; // Initialize frequency for new key
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
