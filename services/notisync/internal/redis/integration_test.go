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

func TestRedisService_Integration(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	service, err := NewService(cfg)
	require.NoError(t, err)
	defer service.Close()

	// Clear test database
	ctx := context.Background()
	err = service.FlushAll(ctx)
	require.NoError(t, err)

	// Test health check
	err = service.Health(ctx)
	assert.NoError(t, err)

	// Test notification cache
	t.Run("NotificationCache", func(t *testing.T) {
		notificationID := uuid.New()
		status := &NotificationStatus{
			ID:         notificationID,
			IsRead:     true,
			IsDismissed: false,
			UpdatedAt:  time.Now(),
		}

		// Set status
		err := service.NotificationCache.SetNotificationStatus(ctx, notificationID, status)
		assert.NoError(t, err)

		// Get status
		retrievedStatus, err := service.NotificationCache.GetNotificationStatus(ctx, notificationID)
		assert.NoError(t, err)
		assert.NotNil(t, retrievedStatus)
		assert.Equal(t, status.IsRead, retrievedStatus.IsRead)
	})

	// Test device tracker
	t.Run("DeviceTracker", func(t *testing.T) {
		userID := uuid.New()
		deviceID := uuid.New()

		// Add device to user
		err := service.DeviceTracker.AddUserDevice(ctx, userID, deviceID)
		assert.NoError(t, err)

		// Set device connection
		connection := &DeviceConnection{
			DeviceID: deviceID,
			IsOnline: true,
			LastPing: time.Now(),
		}
		err = service.DeviceTracker.SetDeviceConnection(ctx, deviceID, connection)
		assert.NoError(t, err)

		// Get online devices
		onlineDevices, err := service.DeviceTracker.GetOnlineDevicesForUser(ctx, userID)
		assert.NoError(t, err)
		assert.Contains(t, onlineDevices, deviceID)
	})

	// Test message queue
	t.Run("MessageQueue", func(t *testing.T) {
		deviceID := uuid.New()
		notificationID := uuid.New()

		// Enqueue notification sync
		err := service.MessageQueue.EnqueueNotificationSync(ctx, deviceID, notificationID, "read")
		assert.NoError(t, err)

		// Check queue length
		length, err := service.MessageQueue.GetQueueLength(ctx, deviceID)
		assert.NoError(t, err)
		assert.Equal(t, int64(1), length)

		// Dequeue messages
		messages, err := service.MessageQueue.DequeueMessages(ctx, deviceID)
		assert.NoError(t, err)
		assert.Len(t, messages, 1)
		assert.Equal(t, "notification_sync", messages[0].Type)
	})

	// Test pub/sub (basic functionality)
	t.Run("PubSub", func(t *testing.T) {
		userID := uuid.New()
		notificationID := uuid.New()

		// Publish notification update
		err := service.PubSub.PublishNotificationUpdate(ctx, userID, notificationID, "read", nil)
		assert.NoError(t, err)

		// Publish device status update
		deviceID := uuid.New()
		err = service.PubSub.PublishDeviceStatusUpdate(ctx, userID, deviceID, "online")
		assert.NoError(t, err)
	})
}

func TestRedisService_CompleteWorkflow(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	service, err := NewService(cfg)
	require.NoError(t, err)
	defer service.Close()

	// Clear test database
	ctx := context.Background()
	err = service.FlushAll(ctx)
	require.NoError(t, err)

	// Simulate complete notification workflow
	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()
	notificationID := uuid.New()

	// Step 1: Add devices to user
	err = service.DeviceTracker.AddUserDevice(ctx, userID, deviceID1)
	require.NoError(t, err)
	err = service.DeviceTracker.AddUserDevice(ctx, userID, deviceID2)
	require.NoError(t, err)

	// Step 2: Set device connections (device1 online, device2 offline)
	connection1 := &DeviceConnection{
		DeviceID: deviceID1,
		IsOnline: true,
		LastPing: time.Now(),
	}
	err = service.DeviceTracker.SetDeviceConnection(ctx, deviceID1, connection1)
	require.NoError(t, err)

	// Step 3: Cache notification status
	status := &NotificationStatus{
		ID:         notificationID,
		IsRead:     false,
		IsDismissed: false,
		UpdatedAt:  time.Now(),
	}
	err = service.NotificationCache.SetNotificationStatus(ctx, notificationID, status)
	require.NoError(t, err)

	// Step 4: Publish new notification
	notificationData := map[string]interface{}{
		"id":       notificationID.String(),
		"app_name": "TestApp",
		"title":    "Test Notification",
	}
	err = service.PubSub.PublishNewNotification(ctx, userID, notificationData)
	require.NoError(t, err)

	// Step 5: Queue message for offline device
	err = service.MessageQueue.EnqueueNotificationSync(ctx, deviceID2, notificationID, "new")
	require.NoError(t, err)

	// Step 6: Update notification status (mark as read)
	status.IsRead = true
	status.UpdatedAt = time.Now()
	err = service.NotificationCache.SetNotificationStatus(ctx, notificationID, status)
	require.NoError(t, err)

	// Step 7: Publish sync event
	err = service.PubSub.PublishNotificationSync(ctx, userID, notificationID, true, false, deviceID1)
	require.NoError(t, err)

	// Step 8: Queue status update for offline device
	err = service.MessageQueue.EnqueueStatusUpdate(ctx, deviceID2, notificationID, true, false)
	require.NoError(t, err)

	// Verify final state
	// Check notification status
	finalStatus, err := service.NotificationCache.GetNotificationStatus(ctx, notificationID)
	assert.NoError(t, err)
	assert.NotNil(t, finalStatus)
	assert.True(t, finalStatus.IsRead)
	assert.False(t, finalStatus.IsDismissed)

	// Check online devices
	onlineDevices, err := service.DeviceTracker.GetOnlineDevicesForUser(ctx, userID)
	assert.NoError(t, err)
	assert.Len(t, onlineDevices, 1)
	assert.Contains(t, onlineDevices, deviceID1)

	// Check queued messages for offline device
	queueLength, err := service.MessageQueue.GetQueueLength(ctx, deviceID2)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), queueLength) // new notification + status update

	// Simulate device2 coming online and processing queue
	messages, err := service.MessageQueue.DequeueMessages(ctx, deviceID2)
	assert.NoError(t, err)
	assert.Len(t, messages, 2)

	// Verify queue is empty after processing
	queueLength, err = service.MessageQueue.GetQueueLength(ctx, deviceID2)
	assert.NoError(t, err)
	assert.Equal(t, int64(0), queueLength)
}