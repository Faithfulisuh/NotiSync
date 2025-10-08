# Notification Processing API Examples

## Create Notification

```bash
curl -X POST http://localhost:8080/api/v1/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "app_name": "Slack",
    "title": "New message in #general",
    "body": "Team meeting at 3 PM today",
    "category": "Work",
    "priority": 2
  }'
```

Response:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "987fcdeb-51a2-43d7-8f9e-123456789abc",
  "source_device_id": "456e7890-12ab-34cd-56ef-789012345678",
  "app_name": "Slack",
  "title": "New message in #general",
  "body": "Team meeting at 3 PM today",
  "category": "Work",
  "priority": 2,
  "is_read": false,
  "is_dismissed": false,
  "created_at": "2024-01-15T10:30:00Z",
  "expires_at": "2024-01-22T10:30:00Z"
}
```

## Get Notifications

### All Notifications
```bash
curl -X GET "http://localhost:8080/api/v1/notifications?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Filter by Category
```bash
curl -X GET "http://localhost:8080/api/v1/notifications?category=Work&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Search Notifications
```bash
curl -X GET "http://localhost:8080/api/v1/notifications?search=meeting&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:
```json
{
  "notifications": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "app_name": "Slack",
      "title": "New message in #general",
      "body": "Team meeting at 3 PM today",
      "category": "Work",
      "priority": 2,
      "is_read": false,
      "is_dismissed": false,
      "created_at": "2024-01-15T10:30:00Z",
      "expires_at": "2024-01-22T10:30:00Z"
    }
  ],
  "limit": 20,
  "offset": 0
}
```

## Update Notification Status

### Mark as Read
```bash
curl -X PUT http://localhost:8080/api/v1/notifications/123e4567-e89b-12d3-a456-426614174000/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "action": "read"
  }'
```

### Mark as Dismissed
```bash
curl -X PUT http://localhost:8080/api/v1/notifications/123e4567-e89b-12d3-a456-426614174000/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "action": "dismissed"
  }'
```

### Mark as Clicked
```bash
curl -X PUT http://localhost:8080/api/v1/notifications/123e4567-e89b-12d3-a456-426614174000/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "action": "clicked"
  }'
```

Response:
```json
{
  "message": "Notification status updated successfully"
}
```

## Get Notification History

```bash
curl -X GET "http://localhost:8080/api/v1/notifications/history?search=email&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:
```json
{
  "notifications": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "app_name": "Gmail",
      "title": "New email from client",
      "body": "Project update required",
      "category": "Work",
      "priority": 1,
      "is_read": true,
      "is_dismissed": false,
      "created_at": "2024-01-14T15:20:00Z",
      "expires_at": "2024-01-21T15:20:00Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "search": "email"
}
```

## Get Notification Statistics

### Today's Stats
```bash
curl -X GET http://localhost:8080/api/v1/notifications/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Specific Date Stats
```bash
curl -X GET "http://localhost:8080/api/v1/notifications/stats?date=2024-01-15" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:
```json
{
  "date": "2024-01-15T00:00:00Z",
  "total": 45,
  "work": 15,
  "personal": 25,
  "junk": 5,
  "by_category": {
    "Work": 15,
    "Personal": 25,
    "Junk": 5
  }
}
```

## Automatic Categorization Examples

### Work Notifications
Apps that are automatically categorized as Work:
- Slack, Microsoft Teams, Outlook, Gmail
- Zoom, WebEx, Skype, Calendar
- Jira, Confluence, Trello, Asana
- Notion, Monday, Salesforce

Content keywords that trigger Work category:
- meeting, conference, deadline, project, task
- client, customer, report, presentation
- schedule, appointment, colleague, team

### Junk Notifications
Content that is automatically categorized as Junk:
- sale, discount, offer, deal, promotion
- limited time, buy now, shop, free shipping
- unsubscribe, marketing, newsletter

### Personal Notifications
Default category for notifications that don't match Work or Junk patterns.

## Content Detection Features

### OTP Detection
Notifications containing these keywords are flagged as OTP:
- otp, verification code, security code, auth code
- login code, 2fa, two-factor, verify
- confirmation code

### Promotional Detection
Notifications containing these keywords are flagged as promotional:
- sale, discount, offer, deal, promotion, coupon
- limited time, buy now, shop, % off
- unsubscribe, marketing, newsletter

## Error Responses

### Validation Error (400)
```json
{
  "error": "app_name is required"
}
```

### Unauthorized (401)
```json
{
  "error": "Invalid user context"
}
```

### Not Found (404)
```json
{
  "error": "notification not found"
}
```

### Expired Notification (400)
```json
{
  "error": "cannot perform action on expired notification"
}
```

## Processing Pipeline

When a notification is created, it goes through this pipeline:

1. **Validation**: Request format and content validation
2. **Device Verification**: Ensure device belongs to user
3. **Automatic Categorization**: Apply Work/Personal/Junk classification
4. **Content Sanitization**: Remove HTML tags and suspicious content
5. **Storage**: Save to database with 7-day expiration
6. **Device Update**: Update device last seen timestamp

## Status Tracking

Each notification action is tracked with:
- Device ID (which device performed the action)
- Timestamp (when the action occurred)
- Action type (read, dismissed, clicked)

This enables cross-device synchronization and user behavior analytics.