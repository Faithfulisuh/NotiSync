# Redis Integration Example

This document demonstrates how the Redis integration works in NotiSync.

## Overview

The Redis integration provides:
1. **Notification Status Caching** - Fast access to notification read/dismissed status
2. **Device Connection Tracking** - Real-time tracking of online/offline devices
3. **Message Queuing** - Offline message delivery for disconnected devices
4. **Pub/Sub Messaging** - Real-time synchronization between devices

## Usage Examples

### 1. Notification Status Caching

```go
// Cache notification status
status := &redis.NotificationStatus{
    ID:         notificationID,
    IsRead:     true,
    IsDismissed: false,
    UpdatedAt:  time.Now(),
}
err := redisService.NotificationCache.SetNotificationStatus(ctx, notificationID, status)

// Retrieve cached status
cachedStatus, err := redisService.NotificationCache.GetNotificationStatus(ctx, notificationID)
```

### 2. Device Connection Tracking

```go
// Add device to user
err := redisService.DeviceTracker.AddUserDevice(ctx, userID, deviceID)

// Set device as online
connection := &redis.DeviceConnection{
    DeviceID: deviceID,
    IsOnline: true,
    LastPing: time.Now(),
}
err = redisService.DeviceTracker.SetDeviceConnection(ctx, deviceID, connection)

// Get all online devices for user
onlineDevices, err := redisService.DeviceTracker.GetOnlineDevicesForUser(ctx, userID)
```

### 3. Message Queuing for Offline Devices

```go
// Queue notification sync for offline device
err := redisService.MessageQueue.EnqueueNotificationSync(ctx, deviceID, notificationID, "read")

// Queue status update for offline device
err = redisService.MessageQueue.EnqueueStatusUpdate(ctx, deviceID, notificationID, true, false)

// When device comes online, dequeue all messages
messages, err := redisService.MessageQueue.DequeueMessages(ctx, deviceID)
```

### 4. Real-time Pub/Sub Messaging

```go
// Publish new notification to all user devices
notificationData := map[string]interface{}{
    "id":       notificationID.String(),
    "app_name": "WhatsApp",
    "title":    "New Message",
    "body":     "Hello there!",
}
err := redisService.PubSub.PublishNewNotification(ctx, userID, notificationData)

// Publish notification sync event
err = redisService.PubSub.PublishNotificationSync(ctx, userID, notificationID, true, false, sourceDeviceID)
```

## Integration in Notification Processing

The Redis integration is seamlessly integrated into the notification processing pipeline:

### New Notification Flow
1. Notification received from mobile device
2. Stored in PostgreSQL database
3. **Status cached in Redis**
4. **Device heartbeat updated**
5. **Published to other devices via pub/sub**
6. **Queued for offline devices**

### Notification Action Flow
1. User performs action (read/dismiss) on any device
2. Status updated in PostgreSQL database
3. **Status updated in Redis cache**
4. **Sync event published to other devices**
5. **Status update queued for offline devices**

## Configuration

Redis is configured through environment variables:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Data Structures in Redis

### Notification Status Cache
```
Key: notification:{notification_id}:status
Value: {"id": "...", "is_read": true, "is_dismissed": false, "updated_at": "..."}
TTL: 7 days
```

### Device Tracking
```
Key: user:{user_id}:devices
Value: Set of device IDs
TTL: 30 days

Key: device:{device_id}:connection
Value: {"device_id": "...", "is_online": true, "last_ping": "..."}
TTL: 5 minutes
```

### Message Queue
```
Key: device:{device_id}:queue
Value: List of messages [{"type": "notification_sync", "data": {...}}, ...]
TTL: 7 days
```

### Pub/Sub Channels
```
Channel: user:{user_id}
Messages: {"type": "notification_update", "user_id": "...", "data": {...}}
```

## Benefits

1. **Performance** - Fast access to notification status without database queries
2. **Real-time Sync** - Instant synchronization across all connected devices
3. **Offline Support** - Messages queued for devices that are temporarily offline
4. **Scalability** - Redis handles high-frequency read/write operations efficiently
5. **Reliability** - Automatic expiration prevents stale data accumulation

## Testing

Run Redis integration tests:

```bash
# Start Redis for testing
docker run -d -p 6379:6379 redis:7-alpine

# Run tests
go test ./internal/redis/... -v
```

The tests cover:
- Notification status caching
- Device connection tracking
- Message queuing
- Pub/sub messaging
- Complete workflow integration