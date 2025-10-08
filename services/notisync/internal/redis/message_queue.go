package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// QueueMessage represents a message in the offline device queue
type QueueMessage struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
	Retries   int                    `json:"retries"`
}

// MessageQueue handles message queuing for offline devices
type MessageQueue struct {
	client *Client
}

// NewMessageQueue creates a new message queue service
func NewMessageQueue(client *Client) *MessageQueue {
	return &MessageQueue{
		client: client,
	}
}

// EnqueueMessage adds a message to a device's offline queue
func (mq *MessageQueue) EnqueueMessage(ctx context.Context, deviceID uuid.UUID, message *QueueMessage) error {
	key := fmt.Sprintf("device:%s:queue", deviceID.String())
	
	// Set message ID if not provided
	if message.ID == "" {
		message.ID = uuid.New().String()
	}
	
	// Set timestamp if not provided
	if message.Timestamp.IsZero() {
		message.Timestamp = time.Now()
	}

	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal queue message: %w", err)
	}

	// Add to the left of the list (LPUSH) so newer messages are at the front
	err = mq.client.LPush(ctx, key, data).Err()
	if err != nil {
		return fmt.Errorf("failed to enqueue message: %w", err)
	}

	// Set expiration for the queue (7 days)
	mq.client.Expire(ctx, key, 7*24*time.Hour)

	// Trim the queue to keep only the last 1000 messages
	mq.client.LTrim(ctx, key, 0, 999)

	return nil
}

// DequeueMessages retrieves and removes all messages from a device's queue
func (mq *MessageQueue) DequeueMessages(ctx context.Context, deviceID uuid.UUID) ([]*QueueMessage, error) {
	key := fmt.Sprintf("device:%s:queue", deviceID.String())
	
	// Get all messages from the queue
	messageStrings, err := mq.client.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get queued messages: %w", err)
	}

	if len(messageStrings) == 0 {
		return []*QueueMessage{}, nil
	}

	// Clear the queue
	err = mq.client.Del(ctx, key).Err()
	if err != nil {
		return nil, fmt.Errorf("failed to clear message queue: %w", err)
	}

	// Parse messages
	messages := make([]*QueueMessage, 0, len(messageStrings))
	for _, messageStr := range messageStrings {
		var message QueueMessage
		if err := json.Unmarshal([]byte(messageStr), &message); err != nil {
			continue // Skip invalid messages
		}
		messages = append(messages, &message)
	}

	return messages, nil
}

// PeekMessages retrieves messages from a device's queue without removing them
func (mq *MessageQueue) PeekMessages(ctx context.Context, deviceID uuid.UUID, limit int) ([]*QueueMessage, error) {
	key := fmt.Sprintf("device:%s:queue", deviceID.String())
	
	if limit <= 0 {
		limit = 10 // Default limit
	}

	messageStrings, err := mq.client.LRange(ctx, key, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to peek queued messages: %w", err)
	}

	messages := make([]*QueueMessage, 0, len(messageStrings))
	for _, messageStr := range messageStrings {
		var message QueueMessage
		if err := json.Unmarshal([]byte(messageStr), &message); err != nil {
			continue // Skip invalid messages
		}
		messages = append(messages, &message)
	}

	return messages, nil
}

// GetQueueLength returns the number of messages in a device's queue
func (mq *MessageQueue) GetQueueLength(ctx context.Context, deviceID uuid.UUID) (int64, error) {
	key := fmt.Sprintf("device:%s:queue", deviceID.String())
	
	length, err := mq.client.LLen(ctx, key).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue length: %w", err)
	}

	return length, nil
}

// ClearQueue removes all messages from a device's queue
func (mq *MessageQueue) ClearQueue(ctx context.Context, deviceID uuid.UUID) error {
	key := fmt.Sprintf("device:%s:queue", deviceID.String())
	
	err := mq.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to clear queue: %w", err)
	}

	return nil
}

// EnqueueNotificationSync creates a notification sync message for offline devices
func (mq *MessageQueue) EnqueueNotificationSync(ctx context.Context, deviceID uuid.UUID, notificationID uuid.UUID, action string) error {
	message := &QueueMessage{
		Type: "notification_sync",
		Data: map[string]interface{}{
			"notification_id": notificationID.String(),
			"action":         action,
		},
	}

	return mq.EnqueueMessage(ctx, deviceID, message)
}

// EnqueueStatusUpdate creates a status update message for offline devices
func (mq *MessageQueue) EnqueueStatusUpdate(ctx context.Context, deviceID uuid.UUID, notificationID uuid.UUID, isRead, isDismissed bool) error {
	message := &QueueMessage{
		Type: "status_update",
		Data: map[string]interface{}{
			"notification_id": notificationID.String(),
			"is_read":        isRead,
			"is_dismissed":   isDismissed,
		},
	}

	return mq.EnqueueMessage(ctx, deviceID, message)
}