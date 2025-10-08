package redis

import (
	"context"
	"fmt"

	"github.com/notisync/backend/internal/config"
)

// Service provides a unified interface to all Redis functionality
type Service struct {
	Client              *Client
	NotificationCache   *NotificationCache
	DeviceTracker       *DeviceTracker
	MessageQueue        *MessageQueue
	PubSub              *PubSubService
}

// NewService creates a new Redis service with all components
func NewService(cfg *config.RedisConfig) (*Service, error) {
	client, err := NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create Redis client: %w", err)
	}

	return &Service{
		Client:              client,
		NotificationCache:   NewNotificationCache(client),
		DeviceTracker:       NewDeviceTracker(client),
		MessageQueue:        NewMessageQueue(client),
		PubSub:              NewPubSubService(client),
	}, nil
}

// Close closes all Redis connections
func (s *Service) Close() error {
	return s.Client.Close()
}

// Health checks if Redis is healthy
func (s *Service) Health(ctx context.Context) error {
	return s.Client.Health(ctx)
}

// FlushAll clears all Redis data (use with caution, mainly for testing)
func (s *Service) FlushAll(ctx context.Context) error {
	return s.Client.FlushAll(ctx).Err()
}