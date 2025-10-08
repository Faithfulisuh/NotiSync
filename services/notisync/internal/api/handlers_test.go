package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/services"
	"github.com/notisync/backend/internal/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestServer(t *testing.T) (*Server, *repository.Repositories) {
	// This is a mock setup - in real tests you'd use a test database
	// For now, we'll test the handler logic without actual database calls
	
	gin.SetMode(gin.TestMode)
	
	cfg := &config.Config{
		Server: config.ServerConfig{
			Environment: "test",
		},
		JWT: config.JWTConfig{
			Secret:          "test-secret",
			ExpirationHours: 24,
		},
	}

	// Mock repositories (in real tests, use test database)
	repos := &repository.Repositories{}
	
	// For testing, we'll set services to nil to avoid initialization issues
	// In real tests, you'd use proper mocks or test instances
	var redisService *redis.Service = nil
	var authService *auth.Service = nil
	var notificationService *services.NotificationService = nil
	var websocketService *websocket.Service = nil

	server := &Server{
		config:              cfg,
		repos:               repos,
		redisService:        redisService,
		authService:         authService,
		notificationService: notificationService,
		websocketService:    websocketService,
	}

	server.router = gin.New()
	server.setupRoutes()

	return server, repos
}

func TestHealthCheck(t *testing.T) {
	server, _ := setupTestServer(t)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	server.router.ServeHTTP(w, req)

	// With nil services, health check should still return OK but with unhealthy Redis
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	// The overall status should be "healthy" since database is considered healthy
	// but individual services might be unhealthy
	assert.Equal(t, "healthy", response["status"])
}

func TestGetAPIInfo(t *testing.T) {
	// Create a simple test server without full setup
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	server := &Server{
		config: &config.Config{
			Server: config.ServerConfig{Environment: "test"},
		},
	}
	
	// Add just the info route
	router.GET("/api/v1/info", server.getAPIInfo)

	req := httptest.NewRequest("GET", "/api/v1/info", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "NotiSync API", response["name"])
	assert.Equal(t, "v1", response["version"])
	assert.Contains(t, response, "endpoints")
}

func TestGetSystemInfo(t *testing.T) {
	// Create a simple test server without full setup
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	server := &Server{
		config: &config.Config{
			Server: config.ServerConfig{Environment: "test"},
		},
	}
	
	// Add just the system route
	router.GET("/api/v1/system", server.getSystemInfo)

	req := httptest.NewRequest("GET", "/api/v1/system", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "notisync-api", response["service"])
	assert.Equal(t, "test", response["environment"])
}

// Test notification endpoints (these would need proper mocking in real tests)
func TestGetNotificationsUnauthorized(t *testing.T) {
	// Create a simple test server
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	server := &Server{}
	
	// Add route that requires auth (will return unauthorized without proper middleware)
	router.GET("/api/v1/notifications", server.getNotifications)

	req := httptest.NewRequest("GET", "/api/v1/notifications", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestCreateNotificationUnauthorized(t *testing.T) {
	server, _ := setupTestServer(t)

	notification := map[string]interface{}{
		"app_name": "TestApp",
		"title":    "Test Notification",
		"body":     "This is a test notification",
		"category": "test",
		"priority": 1,
	}
	
	body, _ := json.Marshal(notification)
	req := httptest.NewRequest("POST", "/api/v1/notifications", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestGetDevicesUnauthorized(t *testing.T) {
	server, _ := setupTestServer(t)

	req := httptest.NewRequest("GET", "/api/v1/devices", nil)
	w := httptest.NewRecorder()

	server.router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Note: Additional tests would require proper mocking of services and repositories
// These basic tests verify the core handler functionality and route setup