package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// PubSubMessage represents a message published to Redis pub/sub
type PubSubMessage struct {
	Type      string                 `json:"type"`
	UserID    uuid.UUID              `json:"user_id"`
	DeviceID  uuid.UUID              `json:"device_id,omitempty"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
}

// PubSubService handles Redis pub/sub operations
type PubSubService struct {
	client *Client
}

// NewPubSubService creates a new pub/sub service
func NewPubSubService(client *Client) *PubSubService {
	return &PubSubService{
		client: client,
	}
}

// PublishNotificationUpdate publishes a notification update to all user devices
func (ps *PubSubService) PublishNotificationUpdate(ctx context.Context, userID, notificationID uuid.UUID, action string, data map[string]interface{}) error {
	message := &PubSubMessage{
		Type:      "notification_update",
		UserID:    userID,
		Data: map[string]interface{}{
			"notification_id": notificationID.String(),
			"action":         action,
		},
		Timestamp: time.Now(),
	}

	// Merge additional data
	if data != nil {
		for k, v := range data {
			message.Data[k] = v
		}
	}

	return ps.publishMessage(ctx, fmt.Sprintf("user:%s", userID.String()), message)
}

// PublishDeviceStatusUpdate publishes a device status update
func (ps *PubSubService) PublishDeviceStatusUpdate(ctx context.Context, userID, deviceID uuid.UUID, status string) error {
	message := &PubSubMessage{
		Type:     "device_status",
		UserID:   userID,
		DeviceID: deviceID,
		Data: map[string]interface{}{
			"status": status,
		},
		Timestamp: time.Now(),
	}

	return ps.publishMessage(ctx, fmt.Sprintf("user:%s", userID.String()), message)
}

// PublishNotificationSync publishes a notification sync event
func (ps *PubSubService) PublishNotificationSync(ctx context.Context, userID, notificationID uuid.UUID, isRead, isDismissed bool, sourceDeviceID uuid.UUID) error {
	message := &PubSubMessage{
		Type:     "notification_sync",
		UserID:   userID,
		DeviceID: sourceDeviceID,
		Data: map[string]interface{}{
			"notification_id": notificationID.String(),
			"is_read":        isRead,
			"is_dismissed":   isDismissed,
		},
		Timestamp: time.Now(),
	}

	return ps.publishMessage(ctx, fmt.Sprintf("user:%s", userID.String()), message)
}

// PublishNewNotification publishes a new notification event
func (ps *PubSubService) PublishNewNotification(ctx context.Context, userID uuid.UUID, notificationData map[string]interface{}) error {
	message := &PubSubMessage{
		Type:      "new_notification",
		UserID:    userID,
		Data:      notificationData,
		Timestamp: time.Now(),
	}

	return ps.publishMessage(ctx, fmt.Sprintf("user:%s", userID.String()), message)
}

// publishMessage publishes a message to a Redis channel
func (ps *PubSubService) publishMessage(ctx context.Context, channel string, message *PubSubMessage) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal pub/sub message: %w", err)
	}

	err = ps.client.Publish(ctx, channel, data).Err()
	if err != nil {
		return fmt.Errorf("failed to publish message to channel %s: %w", channel, err)
	}

	return nil
}

// SubscribeToUser subscribes to all messages for a specific user
func (ps *PubSubService) SubscribeToUser(ctx context.Context, userID uuid.UUID, handler func(*PubSubMessage)) error {
	channel := fmt.Sprintf("user:%s", userID.String())
	
	pubsub := ps.client.Subscribe(ctx, channel)
	defer pubsub.Close()

	// Wait for subscription confirmation
	_, err := pubsub.Receive(ctx)
	if err != nil {
		return fmt.Errorf("failed to subscribe to channel %s: %w", channel, err)
	}

	// Start listening for messages
	ch := pubsub.Channel()
	
	for {
		select {
		case msg := <-ch:
			if msg == nil {
				return nil // Channel closed
			}

			var pubsubMsg PubSubMessage
			if err := json.Unmarshal([]byte(msg.Payload), &pubsubMsg); err != nil {
				log.Printf("Failed to unmarshal pub/sub message: %v", err)
				continue
			}

			handler(&pubsubMsg)

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// SubscribeToPattern subscribes to channels matching a pattern
func (ps *PubSubService) SubscribeToPattern(ctx context.Context, pattern string, handler func(string, *PubSubMessage)) error {
	pubsub := ps.client.PSubscribe(ctx, pattern)
	defer pubsub.Close()

	// Wait for subscription confirmation
	_, err := pubsub.Receive(ctx)
	if err != nil {
		return fmt.Errorf("failed to subscribe to pattern %s: %w", pattern, err)
	}

	// Start listening for messages
	ch := pubsub.Channel()
	
	for {
		select {
		case msg := <-ch:
			if msg == nil {
				return nil // Channel closed
			}

			var pubsubMsg PubSubMessage
			if err := json.Unmarshal([]byte(msg.Payload), &pubsubMsg); err != nil {
				log.Printf("Failed to unmarshal pub/sub message: %v", err)
				continue
			}

			handler(msg.Channel, &pubsubMsg)

		case <-ctx.Done():
			return ctx.Err()
		}
	}
}