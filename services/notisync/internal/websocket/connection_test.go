package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/notisync/backend/internal/auth"
	"github.com/notisync/backend/internal/config"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConnectionManager_BasicOperations(t *testing.T) {
	cm := NewConnectionManager()
	
	userID := uuid.New()
	deviceID := uuid.New()
	
	// Create a mock connection
	conn := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Send:     make(chan []byte, 256),
	}

	// Test adding connection
	cm.AddConnection(conn)
	assert.Equal(t, 1, cm.GetConnectionCount())

	// Test getting connection
	retrievedConn, exists := cm.GetConnection(conn.ID)
	assert.True(t, exists)
	assert.Equal(t, conn.ID, retrievedConn.ID)

	// Test getting connections by user
	userConnections := cm.GetConnectionsByUser(userID)
	assert.Len(t, userConnections, 1)
	assert.Equal(t, conn.ID, userConnections[0].ID)

	// Test getting connections by device
	deviceConnections := cm.GetConnectionsByDevice(deviceID)
	assert.Len(t, deviceConnections, 1)
	assert.Equal(t, conn.ID, deviceConnections[0].ID)

	// Test removing connection
	cm.RemoveConnection(conn.ID)
	assert.Equal(t, 0, cm.GetConnectionCount())

	// Test getting non-existent connection
	_, exists = cm.GetConnection(conn.ID)
	assert.False(t, exists)
}

func TestConnectionManager_BroadcastOperations(t *testing.T) {
	cm := NewConnectionManager()
	
	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()
	
	// Create mock connections
	conn1 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID1,
		Send:     make(chan []byte, 256),
	}
	
	conn2 := &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID2,
		Send:     make(chan []byte, 256),
	}

	cm.AddConnection(conn1)
	cm.AddConnection(conn2)

	// Test broadcast to user
	message := []byte("test message")
	cm.BroadcastToUser(userID, message)

	// Check that both connections received the message
	select {
	case receivedMsg := <-conn1.Send:
		assert.Equal(t, message, receivedMsg)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Connection 1 did not receive message")
	}

	select {
	case receivedMsg := <-conn2.Send:
		assert.Equal(t, message, receivedMsg)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Connection 2 did not receive message")
	}

	// Test broadcast to device
	deviceMessage := []byte("device message")
	cm.BroadcastToDevice(deviceID1, deviceMessage)

	// Check that only device1 connection received the message
	select {
	case receivedMsg := <-conn1.Send:
		assert.Equal(t, deviceMessage, receivedMsg)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Device 1 connection did not receive message")
	}

	// Device2 should not have received the message
	select {
	case <-conn2.Send:
		t.Fatal("Device 2 connection should not have received message")
	case <-time.After(50 * time.Millisecond):
		// Expected - no message received
	}
}

func TestConnection_SendMessage(t *testing.T) {
	conn := &Connection{
		ID:   uuid.New().String(),
		Send: make(chan []byte, 256),
	}

	message := &Message{
		Type: "test",
		Data: map[string]interface{}{
			"key": "value",
		},
		Timestamp: time.Now(),
	}

	// Test sending message
	err := conn.SendMessage(message)
	assert.NoError(t, err)

	// Check that message was sent
	select {
	case receivedData := <-conn.Send:
		assert.Contains(t, string(receivedData), "test")
		assert.Contains(t, string(receivedData), "value")
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Message was not sent")
	}
}

func TestConnection_CloseOperations(t *testing.T) {
	conn := &Connection{
		ID:   uuid.New().String(),
		Send: make(chan []byte, 256),
	}

	// Test initial state
	assert.False(t, conn.IsClosed())

	// Test closing
	conn.Close()
	assert.True(t, conn.IsClosed())

	// Test sending message to closed connection
	message := &Message{Type: "test"}
	err := conn.SendMessage(message)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "connection is closed")
}

func TestUpgrader_CheckOrigin(t *testing.T) {
	// Test that upgrader allows all origins (for development)
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	
	allowed := Upgrader.CheckOrigin(req)
	assert.True(t, allowed)

	// Test with different origin
	req.Header.Set("Origin", "http://example.com")
	allowed = Upgrader.CheckOrigin(req)
	assert.True(t, allowed)
}

func TestAuthenticateWebSocket(t *testing.T) {
	// This test requires a mock auth service
	// For now, we'll test the basic parameter extraction logic
	
	t.Run("MissingToken", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		
		_, _, err := AuthenticateWebSocket(req, nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no authentication token provided")
	})

	t.Run("MissingDeviceID", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws?token=test-token", nil)
		
		_, _, err := AuthenticateWebSocket(req, nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "device_id parameter required")
	})

	t.Run("InvalidDeviceID", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws?token=test-token&device_id=invalid", nil)
		
		_, _, err := AuthenticateWebSocket(req, nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid device_id")
	})

	t.Run("TokenFromHeader", func(t *testing.T) {
		deviceID := uuid.New()
		req := httptest.NewRequest("GET", "/ws?device_id="+deviceID.String(), nil)
		req.Header.Set("Authorization", "Bearer test-token")
		
		// This will fail at token validation, but we can test parameter extraction
		_, _, err := AuthenticateWebSocket(req, nil)
		assert.Error(t, err)
		// Should fail at token validation, not parameter extraction
		assert.NotContains(t, err.Error(), "no authentication token provided")
		assert.NotContains(t, err.Error(), "device_id parameter required")
	})
}

func TestMessage_JSONSerialization(t *testing.T) {
	message := &Message{
		Type: "test_message",
		Data: map[string]interface{}{
			"string_field": "test",
			"number_field": 42,
			"bool_field":   true,
		},
		Timestamp: time.Now(),
	}

	// Test that message can be serialized and deserialized
	conn := &Connection{
		ID:   uuid.New().String(),
		Send: make(chan []byte, 256),
	}

	err := conn.SendMessage(message)
	assert.NoError(t, err)

	// Verify the JSON structure
	select {
	case data := <-conn.Send:
		jsonStr := string(data)
		assert.Contains(t, jsonStr, "test_message")
		assert.Contains(t, jsonStr, "string_field")
		assert.Contains(t, jsonStr, "test")
		assert.Contains(t, jsonStr, "42")
		assert.Contains(t, jsonStr, "true")
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Message was not sent")
	}
}