package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/notisync/backend/internal/config"
	"github.com/redis/go-redis/v9"
)

type Client struct {
	*redis.Client
}

// NewClient creates a new Redis client with the provided configuration
func NewClient(cfg *config.RedisConfig) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &Client{Client: rdb}, nil
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.Client.Close()
}

// Health checks if Redis is healthy
func (c *Client) Health(ctx context.Context) error {
	return c.Ping(ctx).Err()
}