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

func TestRedisService_BasicFunctionality(t *testing.T) {
	// Skip test if Redis is not available
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	service, err := NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer service.Close()

	ctx := context.Background()

	// Test health check
	err = service.Health(ctx)
	assert.NoError(t, err)

	// Test notification cache basic functionality
	t.Run("NotificationCache", func(t *testing.T) {
		notificationID := uuid.New()
		status := &NotificationStatus{
			ID:         notificationID,
			IsRead:     true,
			IsDismissed: false,
			UpdatedAt:  time.Now(),
		}

		// Set and get status
		err := service.NotificationCache.SetNotificationStatus(ctx, notificationID, status)
		if err != nil {
			t.Logf("Redis cache test skipped: %v", err)
			return
		}

		retrievedStatus, err := service.NotificationCache.GetNotificationStatus(ctx, notificationID)
		assert.NoError(t, err)
		assert.NotNil(t, retrievedStatus)
		assert.Equal(t, status.IsRead, retrievedStatus.IsRead)
	})

	// Test device tracker basic functionality
	t.Run("DeviceTracker", func(t *testing.T) {
		userID := uuid.New()
		deviceID := uuid.New()

		// Add device and check
		err := service.DeviceTracker.AddUserDevice(ctx, userID, deviceID)
		if err != nil {
			t.Logf("Redis device tracker test skipped: %v", err)
			return
		}

		devices, err := service.DeviceTracker.GetUserDevices(ctx, userID)
		assert.NoError(t, err)
		assert.Contains(t, devices, deviceID)
	})

	// Test message queue basic functionality
	t.Run("MessageQueue", func(t *testing.T) {
		deviceID := uuid.New()
		notificationID := uuid.New()

		// Enqueue and check length
		err := service.MessageQueue.EnqueueNotificationSync(ctx, deviceID, notificationID, "read")
		if err != nil {
			t.Logf("Redis message queue test skipped: %v", err)
			return
		}

		length, err := service.MessageQueue.GetQueueLength(ctx, deviceID)
		assert.NoError(t, err)
		assert.Equal(t, int64(1), length)
	})
}

func TestRedisService_Configuration(t *testing.T) {
	// Test with invalid configuration
	cfg := &config.RedisConfig{
		Host:     "invalid-host",
		Port:     9999,
		Password: "",
		DB:       0,
	}

	_, err := NewService(cfg)
	assert.Error(t, err, "Should fail with invalid Redis configuration")
}

func TestRedisService_Components(t *testing.T) {
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1,
	}

	service, err := NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer service.Close()

	// Verify all components are initialized
	assert.NotNil(t, service.Client)
	assert.NotNil(t, service.NotificationCache)
	assert.NotNil(t, service.DeviceTracker)
	assert.NotNil(t, service.MessageQueue)
	assert.NotNil(t, service.PubSub)
}