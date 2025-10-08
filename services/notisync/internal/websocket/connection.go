package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/notisync/backend/internal/auth"
)

// Connection represents a WebSocket connection
type Connection struct {
	ID       string
	UserID   uuid.UUID
	DeviceID uuid.UUID
	Conn     *websocket.Conn
	Send     chan []byte
	Hub      *Hub
	mu       sync.RWMutex
	closed   bool
}

// Message represents a WebSocket message
type Message struct {
	Type      string                 `json:"type"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
}

// ConnectionManager manages WebSocket connections
type ConnectionManager struct {
	connections map[string]*Connection
	mu          sync.RWMutex
}

// NewConnectionManager creates a new connection manager
func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*Connection),
	}
}

// AddConnection adds a connection to the manager
func (cm *ConnectionManager) AddConnection(conn *Connection) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.connections[conn.ID] = conn
}

// RemoveConnection removes a connection from the manager
func (cm *ConnectionManager) RemoveConnection(connectionID string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if conn, exists := cm.connections[connectionID]; exists {
		conn.Close()
		delete(cm.connections, connectionID)
	}
}

// GetConnection retrieves a connection by ID
func (cm *ConnectionManager) GetConnection(connectionID string) (*Connection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	conn, exists := cm.connections[connectionID]
	return conn, exists
}

// GetConnectionsByUser retrieves all connections for a user
func (cm *ConnectionManager) GetConnectionsByUser(userID uuid.UUID) []*Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	
	var userConnections []*Connection
	for _, conn := range cm.connections {
		if conn.UserID == userID {
			userConnections = append(userConnections, conn)
		}
	}
	return userConnections
}

// GetConnectionsByDevice retrieves all connections for a device
func (cm *ConnectionManager) GetConnectionsByDevice(deviceID uuid.UUID) []*Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	
	var deviceConnections []*Connection
	for _, conn := range cm.connections {
		if conn.DeviceID == deviceID {
			deviceConnections = append(deviceConnections, conn)
		}
	}
	return deviceConnections
}

// GetConnectionCount returns the total number of active connections
func (cm *ConnectionManager) GetConnectionCount() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return len(cm.connections)
}

// BroadcastToUser sends a message to all connections for a specific user
func (cm *ConnectionManager) BroadcastToUser(userID uuid.UUID, message []byte) {
	connections := cm.GetConnectionsByUser(userID)
	for _, conn := range connections {
		select {
		case conn.Send <- message:
		default:
			// Connection is blocked, close it
			cm.RemoveConnection(conn.ID)
		}
	}
}

// BroadcastToDevice sends a message to all connections for a specific device
func (cm *ConnectionManager) BroadcastToDevice(deviceID uuid.UUID, message []byte) {
	connections := cm.GetConnectionsByDevice(deviceID)
	for _, conn := range connections {
		select {
		case conn.Send <- message:
		default:
			// Connection is blocked, close it
			cm.RemoveConnection(conn.ID)
		}
	}
}

// NewConnection creates a new WebSocket connection
func NewConnection(userID, deviceID uuid.UUID, conn *websocket.Conn, hub *Hub) *Connection {
	return &Connection{
		ID:       uuid.New().String(),
		UserID:   userID,
		DeviceID: deviceID,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Hub:      hub,
	}
}

// Close closes the WebSocket connection
func (c *Connection) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	if c.closed {
		return
	}
	
	c.closed = true
	close(c.Send)
	c.Conn.Close()
}

// IsClosed returns whether the connection is closed
func (c *Connection) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}

// SendMessage sends a message to the WebSocket connection
func (c *Connection) SendMessage(message *Message) error {
	if c.IsClosed() {
		return fmt.Errorf("connection is closed")
	}

	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	select {
	case c.Send <- data:
		return nil
	default:
		return fmt.Errorf("connection send channel is full")
	}
}

// ReadPump handles reading messages from the WebSocket connection
func (c *Connection) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Close()
	}()

	// Set read deadline and pong handler
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var message Message
		if err := json.Unmarshal(messageBytes, &message); err != nil {
			log.Printf("Failed to unmarshal WebSocket message: %v", err)
			continue
		}

		// Handle the message
		c.Hub.HandleMessage(c, &message)
	}
}

// WritePump handles writing messages to the WebSocket connection
func (c *Connection) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// The hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current message
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Upgrader configures the WebSocket upgrader
var Upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from any origin in development
		// In production, this should be more restrictive
		return true
	},
}

// UpgradeConnection upgrades an HTTP connection to WebSocket
func UpgradeConnection(w http.ResponseWriter, r *http.Request, userID, deviceID uuid.UUID, hub *Hub) (*Connection, error) {
	conn, err := Upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to upgrade connection: %w", err)
	}

	connection := NewConnection(userID, deviceID, conn, hub)
	return connection, nil
}

// AuthenticateWebSocket authenticates a WebSocket connection using JWT token
func AuthenticateWebSocket(r *http.Request, authService *auth.Service) (uuid.UUID, uuid.UUID, error) {
	// Get token from query parameter or header
	token := r.URL.Query().Get("token")
	if token == "" {
		token = r.Header.Get("Authorization")
		if token != "" && len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}
	}

	if token == "" {
		return uuid.Nil, uuid.Nil, fmt.Errorf("no authentication token provided")
	}

	// Validate the token
	claims, err := authService.ValidateToken(token)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("invalid token: %w", err)
	}

	userID := claims.UserID

	// Get device ID from query parameter
	deviceIDStr := r.URL.Query().Get("device_id")
	if deviceIDStr == "" {
		return uuid.Nil, uuid.Nil, fmt.Errorf("device_id parameter required")
	}

	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("invalid device_id: %w", err)
	}

	return userID, deviceID, nil
}