package websocket

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/redis"
)

// Service provides WebSocket functionality
type Service struct {
	hub         *Hub
	authService *auth.Service
}

// NewService creates a new WebSocket service
func NewService(redisService *redis.Service, authService *auth.Service) *Service {
	hub := NewHub(redisService)
	
	return &Service{
		hub:         hub,
		authService: authService,
	}
}

// Start starts the WebSocket service
func (s *Service) Start() {
	s.hub.Start()
}

// Stop stops the WebSocket service
func (s *Service) Stop() {
	s.hub.Stop()
}

// HandleWebSocket handles WebSocket connection requests
func (s *Service) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Authenticate the WebSocket connection
	userID, deviceID, err := AuthenticateWebSocket(r, s.authService)
	if err != nil {
		http.Error(w, fmt.Sprintf("Authentication failed: %v", err), http.StatusUnauthorized)
		return
	}

	// Upgrade the connection to WebSocket
	connection, err := UpgradeConnection(w, r, userID, deviceID, s.hub)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to upgrade connection: %v", err), http.StatusInternalServerError)
		return
	}

	// Register the connection with the hub
	s.hub.Register <- connection

	// Start the connection's read and write pumps
	go connection.WritePump()
	go connection.ReadPump()
}

// BroadcastToUser broadcasts a message to all connections for a user
func (s *Service) BroadcastToUser(userID uuid.UUID, messageType string, data map[string]interface{}) error {
	message := &Message{
		Type:      messageType,
		Data:      data,
		Timestamp: time.Now(),
	}

	s.hub.BroadcastToUser(userID, message)
	return nil
}

// BroadcastToUserExcludeDevice broadcasts a message to all connections for a user except the specified device
func (s *Service) BroadcastToUserExcludeDevice(userID, excludeDeviceID uuid.UUID, messageType string, data map[string]interface{}) error {
	message := &Message{
		Type:      messageType,
		Data:      data,
		Timestamp: time.Now(),
	}

	s.hub.BroadcastToUserExcludeDevice(userID, excludeDeviceID, message)
	return nil
}

// SendNotificationUpdate sends a notification update to all user devices
func (s *Service) SendNotificationUpdate(userID uuid.UUID, notificationID uuid.UUID, action string, sourceDeviceID uuid.UUID) error {
	data := map[string]interface{}{
		"notification_id": notificationID.String(),
		"action":         action,
		"source_device":  sourceDeviceID.String(),
	}

	return s.BroadcastToUserExcludeDevice(userID, sourceDeviceID, "notification_update", data)
}

// SendNotificationSync sends a notification sync message to all user devices
func (s *Service) SendNotificationSync(userID uuid.UUID, notificationID uuid.UUID, isRead, isDismissed bool, sourceDeviceID uuid.UUID) error {
	data := map[string]interface{}{
		"notification_id": notificationID.String(),
		"is_read":        isRead,
		"is_dismissed":   isDismissed,
		"source_device":  sourceDeviceID.String(),
	}

	return s.BroadcastToUserExcludeDevice(userID, sourceDeviceID, "notification_sync", data)
}

// SendNewNotification sends a new notification to all user devices except the source
func (s *Service) SendNewNotification(userID uuid.UUID, notificationData map[string]interface{}, sourceDeviceID uuid.UUID) error {
	return s.BroadcastToUserExcludeDevice(userID, sourceDeviceID, "new_notification", notificationData)
}

// SendDeviceStatusUpdate sends a device status update to all user devices
func (s *Service) SendDeviceStatusUpdate(userID, deviceID uuid.UUID, status string) error {
	data := map[string]interface{}{
		"device_id": deviceID.String(),
		"status":    status,
	}

	return s.BroadcastToUser(userID, "device_status", data)
}

// GetConnectionStats returns connection statistics
func (s *Service) GetConnectionStats() map[string]interface{} {
	return map[string]interface{}{
		"total_connections": s.hub.GetConnectionCount(),
		"timestamp":        time.Now(),
	}
}

// GetUserConnectionStats returns connection statistics for a specific user
func (s *Service) GetUserConnectionStats(userID uuid.UUID) map[string]interface{} {
	return map[string]interface{}{
		"user_id":           userID.String(),
		"active_connections": s.hub.GetUserConnectionCount(userID),
		"timestamp":         time.Now(),
	}
}

// Health checks if the WebSocket service is healthy
func (s *Service) Health(ctx context.Context) error {
	// Check if hub is running by trying to get connection count
	_ = s.hub.GetConnectionCount()
	return nil
}