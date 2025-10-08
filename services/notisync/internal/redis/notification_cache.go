package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// NotificationStatus represents the cached status of a notification
type NotificationStatus struct {
	ID         uuid.UUID `json:"id"`
	IsRead     bool      `json:"is_read"`
	IsDismissed bool     `json:"is_dismissed"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// NotificationCache handles notification status caching
type NotificationCache struct {
	client *Client
}

// NewNotificationCache creates a new notification cache service
func NewNotificationCache(client *Client) *NotificationCache {
	return &NotificationCache{
		client: client,
	}
}

// SetNotificationStatus caches the notification status
func (nc *NotificationCache) SetNotificationStatus(ctx context.Context, notificationID uuid.UUID, status *NotificationStatus) error {
	key := fmt.Sprintf("notification:%s:status", notificationID.String())
	
	data, err := json.Marshal(status)
	if err != nil {
		return fmt.Errorf("failed to marshal notification status: %w", err)
	}

	// Cache for 7 days (same as notification expiration)
	err = nc.client.Set(ctx, key, data, 7*24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to cache notification status: %w", err)
	}

	return nil
}

// GetNotificationStatus retrieves the cached notification status
func (nc *NotificationCache) GetNotificationStatus(ctx context.Context, notificationID uuid.UUID) (*NotificationStatus, error) {
	key := fmt.Sprintf("notification:%s:status", notificationID.String())
	
	data, err := nc.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to get notification status: %w", err)
	}

	var status NotificationStatus
	if err := json.Unmarshal([]byte(data), &status); err != nil {
		return nil, fmt.Errorf("failed to unmarshal notification status: %w", err)
	}

	return &status, nil
}

// DeleteNotificationStatus removes the cached notification status
func (nc *NotificationCache) DeleteNotificationStatus(ctx context.Context, notificationID uuid.UUID) error {
	key := fmt.Sprintf("notification:%s:status", notificationID.String())
	
	err := nc.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to delete notification status: %w", err)
	}

	return nil
}

// BatchSetNotificationStatus sets multiple notification statuses in a single operation
func (nc *NotificationCache) BatchSetNotificationStatus(ctx context.Context, statuses map[uuid.UUID]*NotificationStatus) error {
	pipe := nc.client.Pipeline()

	for notificationID, status := range statuses {
		key := fmt.Sprintf("notification:%s:status", notificationID.String())
		
		data, err := json.Marshal(status)
		if err != nil {
			return fmt.Errorf("failed to marshal notification status for %s: %w", notificationID, err)
		}

		pipe.Set(ctx, key, data, 7*24*time.Hour)
	}

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to batch set notification statuses: %w", err)
	}

	return nil
}