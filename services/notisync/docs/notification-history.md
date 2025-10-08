# Notification History and Search

This document describes the notification history and search functionality implemented in NotiSync.

## Overview

The notification history system provides comprehensive functionality for:
- Retrieving paginated notification history
- Advanced search with multiple filters
- Automatic cleanup of expired notifications
- Statistics and analytics
- Data export capabilities

## Features

### 1. Notification History Retrieval

Get paginated notification history for a user:

```http
GET /api/v1/history?page=1&page_size=20
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "notifications": [...],
  "total_count": 150,
  "page": 1,
  "page_size": 20,
  "total_pages": 8,
  "has_next": true,
  "has_previous": false
}
```

### 2. Advanced Search

Search notifications with multiple filters:

```http
GET /api/v1/history/search?q=meeting&app_name=Slack&category=Work&read_status=unread&start_date=2024-01-01&end_date=2024-01-31&sort_by=created_at&sort_order=desc&page=1&page_size=20
```

**Query Parameters:**
- `q` (optional): Search keywords (searches in title and body)
- `app_name` (optional): Filter by application name
- `category` (optional): Filter by category (Work, Personal, Junk)
- `read_status` (optional): Filter by read status (all, read, unread)
- `start_date` (optional): Start date filter (YYYY-MM-DD format)
- `end_date` (optional): End date filter (YYYY-MM-DD format)
- `sort_by` (optional): Sort field (created_at, updated_at, app_name, category)
- `sort_order` (optional): Sort order (asc, desc)
- `page` (optional): Page number
- `page_size` (optional): Items per page

### 3. Statistics and Analytics

#### History Statistics
Get comprehensive statistics about notification history:

```http
GET /api/v1/history/stats?days=30
```

**Response:**
```json
{
  "stats": {
    "total": 150,
    "read": 120,
    "unread": 30,
    "dismissed": 25,
    "unique_apps": 8,
    "active_days": 28,
    "daily_breakdown": {
      "2024-01-01": 5,
      "2024-01-02": 8,
      ...
    },
    "categories": {
      "Work": 80,
      "Personal": 50,
      "Junk": 20
    },
    "period_days": 30,
    "timestamp": "2024-01-31T12:00:00Z"
  }
}
```

#### App Breakdown
Get notification count by application:

```http
GET /api/v1/history/apps?days=30
```

**Response:**
```json
{
  "breakdown": {
    "Slack": 45,
    "WhatsApp": 32,
    "Gmail": 28,
    "Teams": 20,
    "Instagram": 15
  },
  "days": 30,
  "timestamp": "2024-01-31T12:00:00Z"
}
```

#### Comprehensive Metrics
Get combined statistics and app breakdown:

```http
GET /api/v1/history/metrics?days=30
```

### 4. Data Export

Export notification history in JSON or CSV format:

```http
GET /api/v1/history/export?format=json&days=30
GET /api/v1/history/export?format=csv&days=30
```

**Query Parameters:**
- `format` (optional): Export format (json, csv) - default: json
- `days` (optional): Number of days to export (max: 365) - default: 30

### 5. Cleanup Operations

#### Manual Cleanup
Manually trigger cleanup of expired notifications:

```http
POST /api/v1/history/cleanup
```

**Response:**
```json
{
  "message": "Cleanup completed successfully",
  "deleted_count": 25,
  "timestamp": "2024-01-31T12:00:00Z"
}
```

#### Automatic Cleanup
The system automatically cleans up notifications that are:
- Older than 7 days from creation date
- Past their expiration date

Cleanup runs automatically every 6 hours.

## Implementation Details

### Database Schema

The notification history functionality uses the existing `notifications` table with these key fields:
- `created_at`: When the notification was created
- `expires_at`: When the notification expires
- `is_read`: Whether the notification has been read
- `is_dismissed`: Whether the notification has been dismissed
- `category`: Notification category (Work, Personal, Junk)
- `app_name`: Source application name
- `title` and `body`: Searchable content

### Search Implementation

The search functionality supports:
- **Full-text search**: Searches in notification title and body
- **Multiple keywords**: All keywords must match (AND logic)
- **Case-insensitive**: Search is case-insensitive
- **Partial matching**: Uses ILIKE for partial string matching

### Caching Strategy

Statistics and app breakdowns are cached in Redis for performance:
- **History stats**: Cached for 1 hour
- **App breakdown**: Cached for 30 minutes
- **Cache keys**: Include user ID and time period for proper isolation

### Performance Considerations

1. **Pagination**: All list endpoints support pagination to handle large datasets
2. **Indexing**: Database indexes on `user_id`, `created_at`, `category`, and `app_name`
3. **Cleanup**: Automatic cleanup prevents database bloat
4. **Caching**: Frequently accessed statistics are cached

## Usage Examples

### Basic History Retrieval
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/history?page=1&page_size=10"
```

### Search for Work Notifications
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/history/search?category=Work&read_status=unread"
```

### Get Last 7 Days Statistics
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/history/stats?days=7"
```

### Export Last Month's Data
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/history/export?format=csv&days=30" \
  -o notifications.csv
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200 OK`: Successful operation
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses include descriptive messages:
```json
{
  "error": "Invalid date format. Use YYYY-MM-DD format."
}
```

## Testing

Run the notification history test suite:

```bash
# Unit tests
go test ./internal/repository -run TestNotificationHistory
go test ./internal/services -run TestNotificationHistory
go test ./internal/api -run TestHistoryHandlers

# Integration test
go run ./cmd/history-test/main.go
```

## Configuration

No additional configuration is required. The history functionality uses the existing database and Redis connections.

The cleanup scheduler can be configured by modifying the interval in `server.go`:

```go
// Start notification cleanup scheduler (runs every 6 hours)
historyService.ScheduleCleanup(6 * time.Hour)
```