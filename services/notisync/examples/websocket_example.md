# WebSocket Integration Example

This document demonstrates how the WebSocket service works in NotiSync for real-time communication.

## Overview

The WebSocket service provides:
1. **Real-time Connection Management** - Persistent connections with authentication
2. **Message Broadcasting** - Real-time sync across all user devices
3. **Offline Message Queuing** - Messages queued for disconnected devices
4. **Device Status Tracking** - Online/offline status monitoring

## WebSocket Connection

### Connection URL
```
ws://localhost:8080/ws?token=JWT_TOKEN&device_id=DEVICE_UUID
```

### Authentication
- JWT token required via query parameter or Authorization header
- Device ID must be provided as query parameter
- Connection automatically registers with the hub

### Example Connection (JavaScript)
```javascript
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const deviceId = "550e8400-e29b-41d4-a716-446655440000";
const ws = new WebSocket(`ws://localhost:8080/ws?token=${token}&device_id=${deviceId}`);

ws.onopen = function(event) {
    console.log('WebSocket connected');
    
    // Send ping to maintain connection
    setInterval(() => {
        ws.send(JSON.stringify({
            type: "ping",
            data: {},
            timestamp: new Date().toISOString()
        }));
    }, 30000);
};

ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('Received message:', message);
    
    switch(message.type) {
        case 'pong':
            console.log('Pong received');
            break;
        case 'new_notification':
            handleNewNotification(message.data);
            break;
        case 'notification_sync':
            handleNotificationSync(message.data);
            break;
        case 'device_status':
            handleDeviceStatus(message.data);
            break;
    }
};

ws.onerror = function(error) {
    console.error('WebSocket error:', error);
};

ws.onclose = function(event) {
    console.log('WebSocket closed:', event.code, event.reason);
};
```

## Message Types

### 1. Ping/Pong (Heartbeat)
**Client → Server:**
```json
{
    "type": "ping",
    "data": {},
    "timestamp": "2024-01-15T10:30:00Z"
}
```

**Server → Client:**
```json
{
    "type": "pong",
    "data": {
        "timestamp": "2024-01-15T10:30:00Z"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2. New Notification
**Server → Client:**
```json
{
    "type": "new_notification",
    "data": {
        "id": "notification-uuid",
        "app_name": "WhatsApp",
        "title": "New Message",
        "body": "Hello there!",
        "category": "Personal",
        "priority": 0
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. Notification Action
**Client → Server:**
```json
{
    "type": "notification_action",
    "data": {
        "notification_id": "notification-uuid",
        "action": "read"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### 4. Notification Sync
**Server → Client:**
```json
{
    "type": "notification_sync",
    "data": {
        "notification_id": "notification-uuid",
        "is_read": true,
        "is_dismissed": false,
        "source_device": "device-uuid"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### 5. Device Status
**Server → Client:**
```json
{
    "type": "device_status",
    "data": {
        "device_id": "device-uuid",
        "status": "online"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

## Real-time Sync Flow

### Scenario: User reads notification on mobile, syncs to web

1. **Mobile app sends action:**
```json
{
    "type": "notification_action",
    "data": {
        "notification_id": "abc123",
        "action": "read"
    }
}
```

2. **Server processes action:**
   - Updates notification status in database
   - Caches status in Redis
   - Publishes sync event via Redis pub/sub

3. **Web client receives sync:**
```json
{
    "type": "notification_sync",
    "data": {
        "notification_id": "abc123",
        "is_read": true,
        "is_dismissed": false,
        "source_device": "mobile-device-uuid"
    }
}
```

4. **Web client updates UI:**
```javascript
function handleNotificationSync(data) {
    const notificationElement = document.getElementById(`notification-${data.notification_id}`);
    if (notificationElement) {
        if (data.is_read) {
            notificationElement.classList.add('read');
        }
        if (data.is_dismissed) {
            notificationElement.style.display = 'none';
        }
    }
}
```

## Offline Device Support

### When device goes offline:
1. WebSocket connection closes
2. Device status updated to "offline" in Redis
3. Subsequent messages queued in Redis for the device

### When device comes back online:
1. WebSocket connection established
2. Device status updated to "online"
3. All queued messages sent immediately
4. Real-time sync resumes

### Example queued message processing:
```javascript
ws.onopen = function(event) {
    console.log('WebSocket connected - processing queued messages');
    
    // Server automatically sends queued messages
    // Client just needs to handle them normally
};
```

## Connection Management

### Hub Statistics
```bash
# Get connection stats
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/v1/websocket/stats

# Response:
{
    "total_connections": 15,
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### User Connection Stats
```bash
# Get user-specific stats
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8080/api/v1/websocket/users/stats

# Response:
{
    "user_id": "user-uuid",
    "active_connections": 3,
    "timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Handling

### Connection Errors
```javascript
ws.onerror = function(error) {
    console.error('WebSocket error:', error);
    
    // Implement reconnection logic
    setTimeout(() => {
        connectWebSocket();
    }, 5000);
};

ws.onclose = function(event) {
    if (event.code !== 1000) { // Not normal closure
        console.log('Connection lost, attempting to reconnect...');
        setTimeout(() => {
            connectWebSocket();
        }, 2000);
    }
};
```

### Authentication Errors
```javascript
// Handle 401 Unauthorized
ws.onclose = function(event) {
    if (event.code === 1008) { // Policy violation (auth failure)
        console.log('Authentication failed, redirecting to login...');
        window.location.href = '/login';
    }
};
```

## Performance Considerations

### Connection Limits
- Each user can have multiple device connections
- Connections automatically cleaned up on disconnect
- Heartbeat mechanism prevents stale connections

### Message Queuing
- Offline messages queued for up to 7 days
- Queue limited to 1000 messages per device
- Automatic cleanup of expired messages

### Broadcasting Efficiency
- Messages only sent to relevant devices
- Source device excluded from broadcasts
- Batch processing for high-frequency updates

## Testing WebSocket Connection

### Using wscat (command line)
```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c "ws://localhost:8080/ws?token=YOUR_JWT_TOKEN&device_id=YOUR_DEVICE_ID"

# Send ping
{"type":"ping","data":{},"timestamp":"2024-01-15T10:30:00Z"}

# Send notification action
{"type":"notification_action","data":{"notification_id":"abc123","action":"read"},"timestamp":"2024-01-15T10:30:00Z"}
```

### Using curl for HTTP endpoints
```bash
# Health check
curl http://localhost:8080/health

# Should show WebSocket service status
```

## Integration with Notification Processing

The WebSocket service is automatically integrated with the notification processing pipeline:

1. **New notifications** → Broadcast to all user devices
2. **Status changes** → Sync across all devices
3. **Device connections** → Track online/offline status
4. **Offline queuing** → No messages lost

This ensures real-time synchronization with sub-second latency across all connected devices.