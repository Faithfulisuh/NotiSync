package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/redis"
)

// Hub maintains the set of active connections and broadcasts messages to the connections
type Hub struct {
	// Registered connections
	connections *ConnectionManager

	// Register requests from the connections
	Register chan *Connection

	// Unregister requests from connections
	Unregister chan *Connection

	// Broadcast message to all connections for a user
	Broadcast chan *BroadcastMessage

	// Redis service for pub/sub and device tracking
	redisService *redis.Service

	// Context for graceful shutdown
	ctx    context.Context
	cancel context.CancelFunc

	// Wait group for goroutines
	wg sync.WaitGroup

	// Mutex for thread safety
	mu sync.RWMutex
}

// BroadcastMessage represents a message to be broadcast
type BroadcastMessage struct {
	UserID    uuid.UUID
	DeviceID  uuid.UUID // Optional: if set, exclude this device from broadcast
	Message   *Message
	Exclude   bool // If true, exclude the specified device
}

// NewHub creates a new WebSocket hub
func NewHub(redisService *redis.Service) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	
	return &Hub{
		connections:  NewConnectionManager(),
		Register:     make(chan *Connection),
		Unregister:   make(chan *Connection),
		Broadcast:    make(chan *BroadcastMessage),
		redisService: redisService,
		ctx:          ctx,
		cancel:       cancel,
	}
}

// Start starts the hub and begins processing messages
func (h *Hub) Start() {
	h.wg.Add(1)
	go h.run()
	
	// Start Redis pub/sub listener
	h.wg.Add(1)
	go h.listenToRedis()
}

// Stop stops the hub gracefully
func (h *Hub) Stop() {
	h.cancel()
	h.wg.Wait()
}

// run is the main hub loop
func (h *Hub) run() {
	defer h.wg.Done()
	
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case connection := <-h.Register:
			h.registerConnection(connection)

		case connection := <-h.Unregister:
			h.unregisterConnection(connection)

		case broadcastMsg := <-h.Broadcast:
			h.broadcastMessage(broadcastMsg)

		case <-ticker.C:
			h.cleanupStaleConnections()

		case <-h.ctx.Done():
			return
		}
	}
}

// registerConnection registers a new WebSocket connection
func (h *Hub) registerConnection(connection *Connection) {
	h.connections.AddConnection(connection)
	
	// Update device connection status in Redis
	ctx := context.Background()
	deviceConnection := &redis.DeviceConnection{
		DeviceID:  connection.DeviceID,
		SocketID:  connection.ID,
		LastPing:  time.Now(),
		IsOnline:  true,
	}
	
	if err := h.redisService.DeviceTracker.SetDeviceConnection(ctx, connection.DeviceID, deviceConnection); err != nil {
		log.Printf("Failed to update device connection in Redis: %v", err)
	}

	// Add device to user's device set
	if err := h.redisService.DeviceTracker.AddUserDevice(ctx, connection.UserID, connection.DeviceID); err != nil {
		log.Printf("Failed to add device to user set: %v", err)
	}

	// Publish device status update
	if err := h.redisService.PubSub.PublishDeviceStatusUpdate(ctx, connection.UserID, connection.DeviceID, "online"); err != nil {
		log.Printf("Failed to publish device status update: %v", err)
	}

	// Send queued messages to the newly connected device
	h.sendQueuedMessages(connection)

	log.Printf("WebSocket connection registered: user=%s, device=%s, connection=%s", 
		connection.UserID, connection.DeviceID, connection.ID)
}

// unregisterConnection unregisters a WebSocket connection
func (h *Hub) unregisterConnection(connection *Connection) {
	h.connections.RemoveConnection(connection.ID)
	
	// Update device connection status in Redis
	ctx := context.Background()
	if err := h.redisService.DeviceTracker.RemoveDeviceConnection(ctx, connection.DeviceID); err != nil {
		log.Printf("Failed to remove device connection from Redis: %v", err)
	}

	// Publish device status update
	if err := h.redisService.PubSub.PublishDeviceStatusUpdate(ctx, connection.UserID, connection.DeviceID, "offline"); err != nil {
		log.Printf("Failed to publish device status update: %v", err)
	}

	log.Printf("WebSocket connection unregistered: user=%s, device=%s, connection=%s", 
		connection.UserID, connection.DeviceID, connection.ID)
}

// broadcastMessage broadcasts a message to connections
func (h *Hub) broadcastMessage(broadcastMsg *BroadcastMessage) {
	messageBytes, err := json.Marshal(broadcastMsg.Message)
	if err != nil {
		log.Printf("Failed to marshal broadcast message: %v", err)
		return
	}

	connections := h.connections.GetConnectionsByUser(broadcastMsg.UserID)
	for _, conn := range connections {
		// Skip the source device if exclude is true
		if broadcastMsg.Exclude && conn.DeviceID == broadcastMsg.DeviceID {
			continue
		}

		select {
		case conn.Send <- messageBytes:
		default:
			// Connection is blocked, remove it
			h.connections.RemoveConnection(conn.ID)
		}
	}
}

// sendQueuedMessages sends queued messages to a newly connected device
func (h *Hub) sendQueuedMessages(connection *Connection) {
	ctx := context.Background()
	
	messages, err := h.redisService.MessageQueue.DequeueMessages(ctx, connection.DeviceID)
	if err != nil {
		log.Printf("Failed to dequeue messages for device %s: %v", connection.DeviceID, err)
		return
	}

	for _, queuedMsg := range messages {
		message := &Message{
			Type:      queuedMsg.Type,
			Data:      queuedMsg.Data,
			Timestamp: queuedMsg.Timestamp,
		}

		if err := connection.SendMessage(message); err != nil {
			log.Printf("Failed to send queued message to connection %s: %v", connection.ID, err)
		}
	}

	if len(messages) > 0 {
		log.Printf("Sent %d queued messages to device %s", len(messages), connection.DeviceID)
	}
}

// cleanupStaleConnections removes connections that are no longer active
func (h *Hub) cleanupStaleConnections() {
	// This is handled by the connection's ReadPump and WritePump
	// We could add additional cleanup logic here if needed
}

// listenToRedis listens to Redis pub/sub messages and broadcasts them to WebSocket connections
func (h *Hub) listenToRedis() {
	defer h.wg.Done()

	// Subscribe to all user channels using pattern matching
	pattern := "user:*"
	
	err := h.redisService.PubSub.SubscribeToPattern(h.ctx, pattern, func(channel string, pubsubMsg *redis.PubSubMessage) {
		// Convert Redis pub/sub message to WebSocket message
		message := &Message{
			Type:      pubsubMsg.Type,
			Data:      pubsubMsg.Data,
			Timestamp: pubsubMsg.Timestamp,
		}

		// Create broadcast message
		broadcastMsg := &BroadcastMessage{
			UserID:   pubsubMsg.UserID,
			DeviceID: pubsubMsg.DeviceID,
			Message:  message,
			Exclude:  pubsubMsg.DeviceID != uuid.Nil, // Exclude source device if specified
		}

		// Send to broadcast channel
		select {
		case h.Broadcast <- broadcastMsg:
		case <-h.ctx.Done():
			return
		}
	})

	if err != nil {
		log.Printf("Failed to subscribe to Redis pub/sub: %v", err)
	}
}

// HandleMessage handles incoming WebSocket messages from clients
func (h *Hub) HandleMessage(connection *Connection, message *Message) {
	ctx := context.Background()

	switch message.Type {
	case "ping":
		// Handle ping message
		pongMessage := &Message{
			Type:      "pong",
			Data:      map[string]interface{}{"timestamp": time.Now()},
			Timestamp: time.Now(),
		}
		connection.SendMessage(pongMessage)

		// Update device heartbeat
		if err := h.redisService.DeviceTracker.UpdateDeviceHeartbeat(ctx, connection.DeviceID); err != nil {
			log.Printf("Failed to update device heartbeat: %v", err)
		}

	case "notification_action":
		// Handle notification action (read, dismiss, etc.)
		h.handleNotificationAction(connection, message)

	case "device_status":
		// Handle device status updates
		h.handleDeviceStatus(connection, message)

	default:
		log.Printf("Unknown message type: %s", message.Type)
	}
}

// handleNotificationAction handles notification action messages
func (h *Hub) handleNotificationAction(connection *Connection, message *Message) {
	ctx := context.Background()

	notificationIDStr, ok := message.Data["notification_id"].(string)
	if !ok {
		log.Printf("Invalid notification_id in action message")
		return
	}

	notificationID, err := uuid.Parse(notificationIDStr)
	if err != nil {
		log.Printf("Invalid notification_id format: %v", err)
		return
	}

	action, ok := message.Data["action"].(string)
	if !ok {
		log.Printf("Invalid action in action message")
		return
	}

	isRead := false
	isDismissed := false

	switch action {
	case "read":
		isRead = true
	case "dismiss":
		isDismissed = true
	case "click":
		isRead = true
	}

	// Update notification status in Redis
	status := &redis.NotificationStatus{
		ID:         notificationID,
		IsRead:     isRead,
		IsDismissed: isDismissed,
		UpdatedAt:  time.Now(),
	}

	if err := h.redisService.NotificationCache.SetNotificationStatus(ctx, notificationID, status); err != nil {
		log.Printf("Failed to update notification status in Redis: %v", err)
		return
	}

	// Publish sync event to other devices
	if err := h.redisService.PubSub.PublishNotificationSync(ctx, connection.UserID, notificationID, isRead, isDismissed, connection.DeviceID); err != nil {
		log.Printf("Failed to publish notification sync: %v", err)
	}
}

// handleDeviceStatus handles device status messages
func (h *Hub) handleDeviceStatus(connection *Connection, message *Message) {
	ctx := context.Background()

	status, ok := message.Data["status"].(string)
	if !ok {
		log.Printf("Invalid status in device status message")
		return
	}

	// Update device heartbeat
	if err := h.redisService.DeviceTracker.UpdateDeviceHeartbeat(ctx, connection.DeviceID); err != nil {
		log.Printf("Failed to update device heartbeat: %v", err)
	}

	// Publish device status update
	if err := h.redisService.PubSub.PublishDeviceStatusUpdate(ctx, connection.UserID, connection.DeviceID, status); err != nil {
		log.Printf("Failed to publish device status update: %v", err)
	}
}

// GetConnectionCount returns the number of active connections
func (h *Hub) GetConnectionCount() int {
	return h.connections.GetConnectionCount()
}

// GetUserConnectionCount returns the number of active connections for a user
func (h *Hub) GetUserConnectionCount(userID uuid.UUID) int {
	return len(h.connections.GetConnectionsByUser(userID))
}

// BroadcastToUser broadcasts a message to all connections for a user
func (h *Hub) BroadcastToUser(userID uuid.UUID, message *Message) {
	broadcastMsg := &BroadcastMessage{
		UserID:  userID,
		Message: message,
	}

	select {
	case h.Broadcast <- broadcastMsg:
	default:
		log.Printf("Broadcast channel is full, dropping message for user %s", userID)
	}
}

// BroadcastToUserExcludeDevice broadcasts a message to all connections for a user except the specified device
func (h *Hub) BroadcastToUserExcludeDevice(userID, excludeDeviceID uuid.UUID, message *Message) {
	broadcastMsg := &BroadcastMessage{
		UserID:   userID,
		DeviceID: excludeDeviceID,
		Message:  message,
		Exclude:  true,
	}

	select {
	case h.Broadcast <- broadcastMsg:
	default:
		log.Printf("Broadcast channel is full, dropping message for user %s", userID)
	}
}