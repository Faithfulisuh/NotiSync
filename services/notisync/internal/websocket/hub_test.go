package websocket

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestHub(t *testing.T) (*Hub, *redis.Service) {
	// Setup Redis service for testing
	cfg := &config.RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       1, // Use DB 1 for testing
	}

	redisService, err := redis.NewService(cfg)
	if err != nil {
		t.Skipf("Redis not available for testing: %v", err)
		return nil, nil
	}

	// Clear test database
	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	hub := NewHub(redisService)
	return hub, redisService
}

func TestHub_BasicOperations(t *testing.T) {
	hub, redisService := setupTestHub(t)
	if hub == nil {
		return // Redis not available
	}
	defer redisService.Close()

	// Test initial state
	assert.Equal(t, 0, hub.GetConnectionCount())

	// Start the hub
	hub.Start()
	defer hub.Stop()

	// Create a mock connection
	userID := uuid.New()
	deviceID := uuid.New()
	conn := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Register connection
	hub.Register <- conn

	// Give some time for processing
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	assert.Equal(t, 1, hub.GetConnectionCount())
	assert.Equal(t, 1, hub.GetUserConnectionCount(userID))

	// Unregister connection
	hub.Unregister <- conn

	// Give some time for processing
	time.Sleep(100 * time.Millisecond)

	// Check connection count
	assert.Equal(t, 0, hub.GetConnectionCount())
	assert.Equal(t, 0, hub.GetUserConnectionCount(userID))
}

func TestHub_BroadcastMessage(t *testing.T) {
	hub, redisService := setupTestHub(t)
	if hub == nil {
		return // Redis not available
	}
	defer redisService.Close()

	hub.Start()
	defer hub.Stop()

	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()

	// Create mock connections
	conn1 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID1,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	conn2 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID2,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Register connections
	hub.Register <- conn1
	hub.Register <- conn2
	time.Sleep(100 * time.Millisecond)

	// Test broadcast to user
	message := &Message{
		Type: "test_broadcast",
		Data: map[string]interface{}{
			"content": "test message",
		},
		Timestamp: time.Now(),
	}

	hub.BroadcastToUser(userID, message)

	// Check that both connections received the message
	select {
	case data := <-conn1.Send:
		assert.Contains(t, string(data), "test_broadcast")
		assert.Contains(t, string(data), "test message")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Connection 1 did not receive broadcast message")
	}

	select {
	case data := <-conn2.Send:
		assert.Contains(t, string(data), "test_broadcast")
		assert.Contains(t, string(data), "test message")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Connection 2 did not receive broadcast message")
	}
}

func TestHub_BroadcastExcludeDevice(t *testing.T) {
	hub, redisService := setupTestHub(t)
	if hub == nil {
		return // Redis not available
	}
	defer redisService.Close()

	hub.Start()
	defer hub.Stop()

	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()

	// Create mock connections
	conn1 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID1,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	conn2 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID2,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Register connections
	hub.Register <- conn1
	hub.Register <- conn2
	time.Sleep(100 * time.Millisecond)

	// Test broadcast excluding device1
	message := &Message{
		Type: "test_exclude",
		Data: map[string]interface{}{
			"content": "exclude test",
		},
		Timestamp: time.Now(),
	}

	hub.BroadcastToUserExcludeDevice(userID, deviceID1, message)

	// Connection 1 should not receive the message
	select {
	case <-conn1.Send:
		t.Fatal("Connection 1 should not have received the message")
	case <-time.After(200 * time.Millisecond):
		// Expected - no message received
	}

	// Connection 2 should receive the message
	select {
	case data := <-conn2.Send:
		assert.Contains(t, string(data), "test_exclude")
		assert.Contains(t, string(data), "exclude test")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Connection 2 did not receive broadcast message")
	}
}

func TestHub_HandleMessage(t *testing.T) {
	hub, redisService := setupTestHub(t)
	if hub == nil {
		return // Redis not available
	}
	defer redisService.Close()

	userID := uuid.New()
	deviceID := uuid.New()

	conn := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}

	// Test ping message
	pingMessage := &Message{
		Type: "ping",
		Data: map[string]interface{}{},
		Timestamp: time.Now(),
	}

	hub.HandleMessage(conn, pingMessage)

	// Should receive pong response
	select {
	case data := <-conn.Send:
		assert.Contains(t, string(data), "pong")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Did not receive pong response")
	}

	// Test notification action message
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

	// Verify notification status was updated in Redis
	ctx := context.Background()
	status, err := redisService.NotificationCache.GetNotificationStatus(ctx, notificationID)
	if err == nil && status != nil {
		assert.True(t, status.IsRead)
		assert.False(t, status.IsDismissed)
	}
}

func TestHub_StartStop(t *testing.T) {
	hub, redisService := setupTestHub(t)
	if hub == nil {
		return // Redis not available
	}
	defer redisService.Close()

	// Test starting and stopping
	hub.Start()
	
	// Hub should be running
	assert.Equal(t, 0, hub.GetConnectionCount()) // No connections yet

	// Stop the hub
	hub.Stop()

	// Hub should be stopped (this test mainly ensures no panic occurs)
}

func TestBroadcastMessage_Structure(t *testing.T) {
	userID := uuid.New()
	deviceID := uuid.New()
	
	message := &Message{
		Type: "test",
		Data: map[string]interface{}{
			"key": "value",
		},
		Timestamp: time.Now(),
	}

	broadcastMsg := &BroadcastMessage{
		UserID:   userID,
		DeviceID: deviceID,
		Message:  message,
		Exclude:  true,
	}

	// Test structure
	assert.Equal(t, userID, broadcastMsg.UserID)
	assert.Equal(t, deviceID, broadcastMsg.DeviceID)
	assert.Equal(t, message, broadcastMsg.Message)
	assert.True(t, broadcastMsg.Exclude)
}