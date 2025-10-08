package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebSocketService_Integration(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	redisService, err := redis.NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer redisService.Close()

	// Clear test database
	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	// Create WebSocket service
	service := NewService(redisService, nil) // No auth service for testing
	service.Start()
	defer service.Stop()

	// Test basic service functionality
	t.Run("ServiceHealth", func(t *testing.T) {
		err := service.Health(ctx)
		assert.NoError(t, err)
	})

	t.Run("ConnectionStats", func(t *testing.T) {
		stats := service.GetConnectionStats()
		assert.Contains(t, stats, "total_connections")
		assert.Equal(t, 0, stats["total_connections"])
	})

	t.Run("BroadcastMethods", func(t *testing.T) {
		userID := uuid.New()
		deviceID := uuid.New()
		notificationID := uuid.New()

		// Test all broadcast methods
		err := service.BroadcastToUser(userID, "test", map[string]interface{}{"data": "test"})
		assert.NoError(t, err)

		err = service.BroadcastToUserExcludeDevice(userID, deviceID, "test", map[string]interface{}{"data": "test"})
		assert.NoError(t, err)

		err = service.SendNotificationUpdate(userID, notificationID, "read", deviceID)
		assert.NoError(t, err)

		err = service.SendNotificationSync(userID, notificationID, true, false, deviceID)
		assert.NoError(t, err)

		err = service.SendNewNotification(userID, map[string]interface{}{"id": notificationID.String()}, deviceID)
		assert.NoError(t, err)

		err = service.SendDeviceStatusUpdate(userID, deviceID, "online")
		assert.NoError(t, err)
	})
}

func TestWebSocketService_MessageFlow(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1,
	}

	redisService, err := redis.NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer redisService.Close()

	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	// Create hub directly for testing
	hub := NewHub(redisService)
	hub.Start()
	defer hub.Stop()

	userID := uuid.New()
	deviceID := uuid.New()

	// Create mock connection
	conn := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Register connection
	hub.Register <- conn
	time.Sleep(100 * time.Millisecond)

	// Test ping message
	t.Run("PingPong", func(t *testing.T) {
		pingMessage := &Message{
			Type:      "ping",
			Data:      map[string]interface{}{},
			Timestamp: time.Now(),
		}

		hub.HandleMessage(conn, pingMessage)

		// Should receive pong
		select {
		case data := <-conn.Send:
			var response Message
			err := json.Unmarshal(data, &response)
			assert.NoError(t, err)
			assert.Equal(t, "pong", response.Type)
		case <-time.After(500 * time.Millisecond):
			t.Fatal("Did not receive pong response")
		}
	})

	// Test notification action
	t.Run("NotificationAction", func(t *testing.T) {
		notificationID := uuid.New()
		actionMessage := &Message{
			Type: "notification_action",
			Data: map[string]interface{}{
				"notification_id": notificationID.String(),
				"action":         "read",
			},
			Timestamp: time.Now(),
		}

		hub.HandleMessage(conn, actionMessage)

		// Verify status was updated in Redis
		time.Sleep(100 * time.Millisecond)
		status, err := redisService.NotificationCache.GetNotificationStatus(ctx, notificationID)
		if err == nil && status != nil {
			assert.True(t, status.IsRead)
		}
	})

	// Test broadcast
	t.Run("Broadcast", func(t *testing.T) {
		message := &Message{
			Type: "test_broadcast",
			Data: map[string]interface{}{
				"content": "broadcast test",
			},
			Timestamp: time.Now(),
		}

		hub.BroadcastToUser(userID, message)

		// Should receive broadcast
		select {
		case data := <-conn.Send:
			assert.Contains(t, string(data), "test_broadcast")
			assert.Contains(t, string(data), "broadcast test")
		case <-time.After(500 * time.Millisecond):
			t.Fatal("Did not receive broadcast message")
		}
	})

	// Unregister connection
	hub.Unregister <- conn
	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, 0, hub.GetConnectionCount())
}

func TestWebSocketService_OfflineQueuing(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1,
	}

	redisService, err := redis.NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer redisService.Close()

	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	hub := NewHub(redisService)
	hub.Start()
	defer hub.Stop()

	userID := uuid.New()
	deviceID := uuid.New()
	notificationID := uuid.New()

	// Queue messages for offline device
	err = redisService.MessageQueue.EnqueueNotificationSync(ctx, deviceID, notificationID, "new")
	require.NoError(t, err)

	err = redisService.MessageQueue.EnqueueStatusUpdate(ctx, deviceID, notificationID, true, false)
	require.NoError(t, err)

	// Verify messages are queued
	length, err := redisService.MessageQueue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), length)

	// Create connection (simulating device coming online)
	conn := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Register connection - should trigger queued message delivery
	hub.Register <- conn
	time.Sleep(200 * time.Millisecond)

	// Verify queue is empty after connection
	length, err = redisService.MessageQueue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(0), length)

	// Connection should have received the queued messages
	receivedCount := 0
	timeout := time.After(1 * time.Second)

	for receivedCount < 2 {
		select {
		case data := <-conn.Send:
			receivedCount++
			t.Logf("Received queued message: %s", string(data))
		case <-timeout:
			break
		}
	}

	assert.Equal(t, 2, receivedCount, "Should have received 2 queued messages")
}

func TestWebSocketService_ConcurrentConnections(t *testing.T) {
	// Setup Redis service
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1,
	}

	redisService, err := redis.NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return
	}
	defer redisService.Close()

	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	hub := NewHub(redisService)
	hub.Start()
	defer hub.Stop()

	userID := uuid.New()
	numConnections := 5

	// Create multiple connections
	connections := make([]*Connection, numConnections)
	for i := 0; i < numConnections; i++ {
		connections[i] = &Connection{
			ID:       uuid.New().String(),
			UserID:   userID,
			DeviceID: uuid.New(),
			Send:     make(chan []byte, 256),
			Hub:      hub,
		}

		hub.Register <- connections[i]
	}

	time.Sleep(200 * time.Millisecond)

	// Verify all connections are registered
	assert.Equal(t, numConnections, hub.GetConnectionCount())
	assert.Equal(t, numConnections, hub.GetUserConnectionCount(userID))

	// Broadcast message to all connections
	message := &Message{
		Type: "concurrent_test",
		Data: map[string]interface{}{
			"message": "broadcast to all",
		},
		Timestamp: time.Now(),
	}

	hub.BroadcastToUser(userID, message)

	// Verify all connections received the message
	for i, conn := range connections {
		select {
		case data := <-conn.Send:
			assert.Contains(t, string(data), "concurrent_test")
			assert.Contains(t, string(data), "broadcast to all")
		case <-time.After(1 * time.Second):
			t.Fatalf("Connection %d did not receive broadcast message", i)
		}
	}

	// Unregister all connections
	for _, conn := range connections {
		hub.Unregister <- conn
	}

	time.Sleep(200 * time.Millisecond)

	// Verify all connections are unregistered
	assert.Equal(t, 0, hub.GetConnectionCount())
	assert.Equal(t, 0, hub.GetUserConnectionCount(userID))
}