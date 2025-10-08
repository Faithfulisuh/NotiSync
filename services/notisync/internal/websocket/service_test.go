package websocket

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestService(t *testing.T) (*Service, *redis.Service, *auth.Service) {
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
		return nil, nil, nil
	}

	// Clear test database
	ctx := context.Background()
	err = redisService.FlushAll(ctx)
	require.NoError(t, err)

	// Create mock auth service (we'll use nil for most tests since we're testing WebSocket logic)
	var authService *auth.Service = nil

	service := NewService(redisService, authService)
	return service, redisService, authService
}

func TestService_BasicOperations(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	// Test initial state
	stats := service.GetConnectionStats()
	assert.Equal(t, 0, stats["total_connections"])

	// Test starting and stopping
	service.Start()
	defer service.Stop()

	// Test health check
	ctx := context.Background()
	err := service.Health(ctx)
	assert.NoError(t, err)
}

func TestService_BroadcastMethods(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	userID := uuid.New()
	deviceID := uuid.New()
	notificationID := uuid.New()

	// Test BroadcastToUser
	err := service.BroadcastToUser(userID, "test_message", map[string]interface{}{
		"content": "test",
	})
	assert.NoError(t, err)

	// Test BroadcastToUserExcludeDevice
	err = service.BroadcastToUserExcludeDevice(userID, deviceID, "test_exclude", map[string]interface{}{
		"content": "exclude test",
	})
	assert.NoError(t, err)

	// Test SendNotificationUpdate
	err = service.SendNotificationUpdate(userID, notificationID, "read", deviceID)
	assert.NoError(t, err)

	// Test SendNotificationSync
	err = service.SendNotificationSync(userID, notificationID, true, false, deviceID)
	assert.NoError(t, err)

	// Test SendNewNotification
	notificationData := map[string]interface{}{
		"id":       notificationID.String(),
		"app_name": "TestApp",
		"title":    "Test Notification",
	}
	err = service.SendNewNotification(userID, notificationData, deviceID)
	assert.NoError(t, err)

	// Test SendDeviceStatusUpdate
	err = service.SendDeviceStatusUpdate(userID, deviceID, "online")
	assert.NoError(t, err)
}

func TestService_ConnectionStats(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	userID := uuid.New()

	// Test GetConnectionStats
	stats := service.GetConnectionStats()
	assert.Contains(t, stats, "total_connections")
	assert.Contains(t, stats, "timestamp")
	assert.Equal(t, 0, stats["total_connections"])

	// Test GetUserConnectionStats
	userStats := service.GetUserConnectionStats(userID)
	assert.Contains(t, userStats, "user_id")
	assert.Contains(t, userStats, "active_connections")
	assert.Contains(t, userStats, "timestamp")
	assert.Equal(t, userID.String(), userStats["user_id"])
	assert.Equal(t, 0, userStats["active_connections"])
}

func TestService_HandleWebSocket_AuthenticationFailure(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	// Test with missing token
	req := httptest.NewRequest("GET", "/ws", nil)
	w := httptest.NewRecorder()

	service.HandleWebSocket(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "Authentication failed")
}

func TestService_HandleWebSocket_MissingDeviceID(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	// Test with token but missing device_id
	req := httptest.NewRequest("GET", "/ws?token=test-token", nil)
	w := httptest.NewRecorder()

	service.HandleWebSocket(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "device_id parameter required")
}

func TestService_MessageTypes(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	userID := uuid.New()
	deviceID := uuid.New()
	notificationID := uuid.New()

	// Test different message types
	testCases := []struct {
		name     string
		method   func() error
		expected string
	}{
		{
			name: "notification_update",
			method: func() error {
				return service.SendNotificationUpdate(userID, notificationID, "read", deviceID)
			},
			expected: "notification_update",
		},
		{
			name: "notification_sync",
			method: func() error {
				return service.SendNotificationSync(userID, notificationID, true, false, deviceID)
			},
			expected: "notification_sync",
		},
		{
			name: "new_notification",
			method: func() error {
				return service.SendNewNotification(userID, map[string]interface{}{"test": "data"}, deviceID)
			},
			expected: "new_notification",
		},
		{
			name: "device_status",
			method: func() error {
				return service.SendDeviceStatusUpdate(userID, deviceID, "online")
			},
			expected: "device_status",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.method()
			assert.NoError(t, err)
		})
	}
}

func TestService_ConcurrentOperations(t *testing.T) {
	service, redisService, _ := setupTestService(t)
	if service == nil {
		return // Redis not available
	}
	defer redisService.Close()

	service.Start()
	defer service.Stop()

	userID := uuid.New()
	deviceID := uuid.New()

	// Test concurrent broadcasts
	done := make(chan bool, 10)
	
	for i := 0; i < 10; i++ {
		go func(i int) {
			defer func() { done <- true }()
			
			err := service.BroadcastToUser(userID, "concurrent_test", map[string]interface{}{
				"message_id": i,
			})
			assert.NoError(t, err)
		}(i)
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		select {
		case <-done:
		case <-time.After(1 * time.Second):
			t.Fatal("Concurrent operation timed out")
		}
	}

	// Service should still be healthy
	err := service.Health(context.Background())
	assert.NoError(t, err)
}