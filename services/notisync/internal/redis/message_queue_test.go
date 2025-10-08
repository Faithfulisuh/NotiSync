package redis

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMessageQueue_EnqueueAndDequeue(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()
	message1 := &QueueMessage{
		Type: "test_message",
		Data: map[string]interface{}{
			"key": "value1",
		},
	}
	message2 := &QueueMessage{
		Type: "test_message",
		Data: map[string]interface{}{
			"key": "value2",
		},
	}

	// Enqueue messages
	err := queue.EnqueueMessage(ctx, deviceID, message1)
	assert.NoError(t, err)

	err = queue.EnqueueMessage(ctx, deviceID, message2)
	assert.NoError(t, err)

	// Check queue length
	length, err := queue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), length)

	// Dequeue messages
	messages, err := queue.DequeueMessages(ctx, deviceID)
	assert.NoError(t, err)
	assert.Len(t, messages, 2)

	// Verify queue is empty after dequeue
	length, err = queue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(0), length)
}

func TestMessageQueue_PeekMessages(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()
	message := &QueueMessage{
		Type: "test_message",
		Data: map[string]interface{}{
			"key": "value",
		},
	}

	// Enqueue message
	err := queue.EnqueueMessage(ctx, deviceID, message)
	assert.NoError(t, err)

	// Peek messages (should not remove them)
	messages, err := queue.PeekMessages(ctx, deviceID, 10)
	assert.NoError(t, err)
	assert.Len(t, messages, 1)

	// Verify queue still has the message
	length, err := queue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), length)
}

func TestMessageQueue_ClearQueue(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()
	message := &QueueMessage{
		Type: "test_message",
		Data: map[string]interface{}{
			"key": "value",
		},
	}

	// Enqueue message
	err := queue.EnqueueMessage(ctx, deviceID, message)
	assert.NoError(t, err)

	// Verify message is there
	length, err := queue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), length)

	// Clear queue
	err = queue.ClearQueue(ctx, deviceID)
	assert.NoError(t, err)

	// Verify queue is empty
	length, err = queue.GetQueueLength(ctx, deviceID)
	assert.NoError(t, err)
	assert.Equal(t, int64(0), length)
}

func TestMessageQueue_EnqueueNotificationSync(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()
	notificationID := uuid.New()

	// Enqueue notification sync
	err := queue.EnqueueNotificationSync(ctx, deviceID, notificationID, "read")
	assert.NoError(t, err)

	// Verify message was enqueued
	messages, err := queue.PeekMessages(ctx, deviceID, 1)
	assert.NoError(t, err)
	assert.Len(t, messages, 1)
	assert.Equal(t, "notification_sync", messages[0].Type)
	assert.Equal(t, notificationID.String(), messages[0].Data["notification_id"])
	assert.Equal(t, "read", messages[0].Data["action"])
}

func TestMessageQueue_EnqueueStatusUpdate(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()
	notificationID := uuid.New()

	// Enqueue status update
	err := queue.EnqueueStatusUpdate(ctx, deviceID, notificationID, true, false)
	assert.NoError(t, err)

	// Verify message was enqueued
	messages, err := queue.PeekMessages(ctx, deviceID, 1)
	assert.NoError(t, err)
	assert.Len(t, messages, 1)
	assert.Equal(t, "status_update", messages[0].Type)
	assert.Equal(t, notificationID.String(), messages[0].Data["notification_id"])
	assert.Equal(t, true, messages[0].Data["is_read"])
	assert.Equal(t, false, messages[0].Data["is_dismissed"])
}

func TestMessageQueue_MessageOrdering(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	queue := NewMessageQueue(client)
	ctx := context.Background()

	deviceID := uuid.New()

	// Enqueue messages with different timestamps
	message1 := &QueueMessage{
		Type:      "test",
		Data:      map[string]interface{}{"order": 1},
		Timestamp: time.Now().Add(-1 * time.Minute),
	}
	message2 := &QueueMessage{
		Type:      "test",
		Data:      map[string]interface{}{"order": 2},
		Timestamp: time.Now(),
	}

	err := queue.EnqueueMessage(ctx, deviceID, message1)
	require.NoError(t, err)

	err = queue.EnqueueMessage(ctx, deviceID, message2)
	require.NoError(t, err)

	// Dequeue and verify order (newer messages should come first)
	messages, err := queue.DequeueMessages(ctx, deviceID)
	assert.NoError(t, err)
	assert.Len(t, messages, 2)
	
	// Since we use LPUSH, newer messages are at the front
	assert.Equal(t, float64(2), messages[0].Data["order"])
	assert.Equal(t, float64(1), messages[1].Data["order"])
}