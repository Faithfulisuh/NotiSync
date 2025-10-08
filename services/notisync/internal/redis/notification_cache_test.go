package redis

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestRedis(t *testing.T) *Client {
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	client, err := NewClient(cfg)
	require.NoError(t, err)

	// Clear test database
	ctx := context.Background()
	err = client.FlushDB(ctx).Err()
	require.NoError(t, err)

	return client
}

func TestNotificationCache_SetAndGetStatus(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	cache := NewNotificationCache(client)
	ctx := context.Background()

	notificationID := uuid.New()
	status := &NotificationStatus{
		ID:         notificationID,
		IsRead:     true,
		IsDismissed: false,
		UpdatedAt:  time.Now(),
	}

	// Test setting status
	err := cache.SetNotificationStatus(ctx, notificationID, status)
	assert.NoError(t, err)

	// Test getting status
	retrievedStatus, err := cache.GetNotificationStatus(ctx, notificationID)
	assert.NoError(t, err)
	assert.NotNil(t, retrievedStatus)
	assert.Equal(t, status.ID, retrievedStatus.ID)
	assert.Equal(t, status.IsRead, retrievedStatus.IsRead)
	assert.Equal(t, status.IsDismissed, retrievedStatus.IsDismissed)
}

func TestNotificationCache_GetNonExistentStatus(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	cache := NewNotificationCache(client)
	ctx := context.Background()

	nonExistentID := uuid.New()

	// Test getting non-existent status
	status, err := cache.GetNotificationStatus(ctx, nonExistentID)
	assert.NoError(t, err)
	assert.Nil(t, status)
}

func TestNotificationCache_DeleteStatus(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	cache := NewNotificationCache(client)
	ctx := context.Background()

	notificationID := uuid.New()
	status := &NotificationStatus{
		ID:         notificationID,
		IsRead:     false,
		IsDismissed: true,
		UpdatedAt:  time.Now(),
	}

	// Set status
	err := cache.SetNotificationStatus(ctx, notificationID, status)
	assert.NoError(t, err)

	// Verify it exists
	retrievedStatus, err := cache.GetNotificationStatus(ctx, notificationID)
	assert.NoError(t, err)
	assert.NotNil(t, retrievedStatus)

	// Delete status
	err = cache.DeleteNotificationStatus(ctx, notificationID)
	assert.NoError(t, err)

	// Verify it's gone
	retrievedStatus, err = cache.GetNotificationStatus(ctx, notificationID)
	assert.NoError(t, err)
	assert.Nil(t, retrievedStatus)
}

func TestNotificationCache_BatchSetStatus(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	cache := NewNotificationCache(client)
	ctx := context.Background()

	// Create multiple statuses
	statuses := make(map[uuid.UUID]*NotificationStatus)
	for i := 0; i < 3; i++ {
		id := uuid.New()
		statuses[id] = &NotificationStatus{
			ID:         id,
			IsRead:     i%2 == 0,
			IsDismissed: i%2 == 1,
			UpdatedAt:  time.Now(),
		}
	}

	// Batch set statuses
	err := cache.BatchSetNotificationStatus(ctx, statuses)
	assert.NoError(t, err)

	// Verify all statuses were set
	for id, expectedStatus := range statuses {
		retrievedStatus, err := cache.GetNotificationStatus(ctx, id)
		assert.NoError(t, err)
		assert.NotNil(t, retrievedStatus)
		assert.Equal(t, expectedStatus.IsRead, retrievedStatus.IsRead)
		assert.Equal(t, expectedStatus.IsDismissed, retrievedStatus.IsDismissed)
	}
}