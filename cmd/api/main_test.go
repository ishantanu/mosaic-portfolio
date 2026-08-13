package main

import (
	"testing"
	"time"
)

func TestAPICacheReturnsFreshAndStaleEntries(t *testing.T) {
	cache := newAPICache(time.Minute)
	cache.Set("portfolio", []byte(`{"value":100}`))

	data, fresh, found := cache.Get("portfolio")
	if !found || !fresh || string(data) != `{"value":100}` {
		t.Fatalf("fresh cache result = data:%q fresh:%t found:%t", data, fresh, found)
	}

	entry := cache.entries["portfolio"]
	entry.cachedAt = time.Now().Add(-2 * time.Minute)
	cache.entries["portfolio"] = entry
	data, fresh, found = cache.Get("portfolio")
	if !found || fresh || string(data) != `{"value":100}` {
		t.Fatalf("stale cache result = data:%q fresh:%t found:%t", data, fresh, found)
	}
}

func TestAPICacheMiss(t *testing.T) {
	data, fresh, found := newAPICache(time.Minute).Get("missing")
	if data != nil || fresh || found {
		t.Fatalf("cache miss = data:%q fresh:%t found:%t", data, fresh, found)
	}
}
