# Daily Digest Generation

This document describes the daily digest generation functionality implemented in NotiSync.

## Overview

The daily digest system provides users with intelligent summaries of their notification activity, including:
- Notification counts by category
- Top 5 most important notifications based on user rules
- Statistical insights and trends
- "Quiet day" detection and messaging
- Actionable recommendations

## Features

### 1. Daily Digest Generation

Generate comprehensive daily digests with intelligent analysis:

```http
GET /api/v1/digest
GET /api/v1/digest/today
```

**Response Structure:**
```json
{
  "user_id": "uuid",
  "date": "2024-01-31",
  "total_notifications": 15,
  "category_breakdown": {
    "Work": 8,
    "Personal": 5,
    "Junk": 2
  },
  "top_notifications": [...],
  "statistics": {
    "total_received": 15,
    "total_read": 12,
    "total_dismissed": 3,
    "total_acted_upon": 15,
    "read_rate": 80.0,
    "dismissal_rate": 20.0,
    "action_rate": 100.0,
    "most_active_app": "Slack",
    "most_active_hour": 14,
    "app_breakdown": {
      "Slack": 6,
      "WhatsApp": 4,
      "Email": 3,
      "Shopping": 2
    },
    "hourly_breakdown": {
      "9": 2,
      "10": 4,
      "14": 6,
      "16": 3
    }
  },
  "is_quiet_day": false,
  "generated_at": "2024-01-31T20:00:00Z",
  "insights": {
    "trend_comparison": "📈 3 more notifications than yesterday (+3)",
    "busiest_period": "14:00 - 15:00 (6 notifications)",
    "recommended_actions": [
      "Consider setting up notification rules to reduce noise"
    ],
    "notification_health": "🟡 Good - Moderate notification volume",
    "weekly_comparison": "📉 2 fewer than same day last week"
  }
}
```

### 2. Historical Digest Retrieval

Get digest for any specific date:

```http
GET /api/v1/digest/date/2024-01-30
```

### 3. Weekly Digest Overview

Get digests for the past 7 days:

```http
GET /api/v1/digest/weekly
```

**Response:**
```json
{
  "digests": [
    {
      "date": "2024-01-25",
      "total_notifications": 12,
      "is_quiet_day": false,
      ...
    },
    {
      "date": "2024-01-26",
      "total_notifications": 2,
      "is_quiet_day": true,
      "quiet_day_message": "What a peaceful day! You had minimal notifications today."
    },
    ...
  ],
  "period": "7 days",
  "generated_at": "2024-01-31T20:00:00Z"
}
```

### 4. Digest Summary Statistics

Get aggregated statistics across multiple days:

```http
GET /api/v1/digest/summary
```

**Response:**
```json
{
  "total_days": 7,
  "total_notifications": 85,
  "average_per_day": 12.14,
  "quiet_days": 2,
  "busiest_day": {
    "date": "2024-01-29",
    "count": 23
  },
  "category_totals": {
    "Work": 45,
    "Personal": 28,
    "Junk": 12
  },
  "period_start": "2024-01-25",
  "period_end": "2024-01-31",
  "generated_at": "2024-01-31T20:00:00Z"
}
```

## Intelligent Features

### 1. Top Notifications Selection

The system intelligently selects the top 5 most important notifications using a sophisticated scoring algorithm:

**Scoring Factors:**
- **Category Weight**: Work (3.0), Personal (2.0), Junk (0.5)
- **Priority Boost**: +1.0 per priority level
- **Read Status**: Unread notifications get +1.0
- **User Rules**: Custom rules can add/subtract up to 5.0 points
- **Security Detection**: OTP/Security notifications get +10.0 (highest priority)
- **Recency**: Recent notifications (< 2 hours) get +0.5

**Security Keywords Detected:**
- OTP, verification, security, login, signin, code
- authenticate, verify, 2FA, two-factor, password

### 2. Quiet Day Detection

Days with ≤3 notifications are automatically detected as "quiet days" with personalized messages:

- "Complete silence! No notifications today - enjoy the peace." (0 notifications)
- "What a peaceful day! You had minimal notifications today."
- "Enjoy the quiet! Only a few notifications came through today."
- "A calm day with very few interruptions."
- "Minimal digital noise today - time well spent!"

### 3. Intelligent Insights

**Trend Analysis:**
- Day-over-day comparison with visual indicators (📈📉➡️)
- Week-over-week comparison for pattern recognition

**Notification Health Assessment:**
- 🟢 Perfect: 0 notifications
- 🟢 Excellent: 1-5 notifications
- 🟡 Good: 6-15 notifications
- 🟠 Busy: 16-30 notifications
- 🔴 Overwhelming: 30+ notifications

**Personalized Recommendations:**
- Suggests notification rules for high-volume days
- Recommends batch processing for many unread notifications
- Identifies patterns for optimization

### 4. Statistical Analysis

**Engagement Metrics:**
- Read rate: Percentage of notifications read
- Dismissal rate: Percentage of notifications dismissed
- Action rate: Percentage of notifications interacted with

**Temporal Analysis:**
- Hourly breakdown showing peak notification times
- Most active hour identification
- App-specific activity patterns

## Implementation Details

### Caching Strategy

Digests are cached in Redis for optimal performance:
- **Cache Duration**: 24 hours per digest
- **Cache Key Format**: `daily_digest:{user_id}:{date}`
- **Cache Invalidation**: Automatic expiration, manual refresh available

### Background Processing

Daily digests can be pre-generated for all users:
- **Schedule**: 8:00 AM daily (configurable)
- **Processing**: Asynchronous background job
- **Fallback**: On-demand generation if cache miss

### User Rules Integration

The digest system integrates with the user rules engine:
- **Rule Types**: always_show, mute, priority_boost
- **Matching**: App filters and keyword filters
- **Scoring Impact**: Rules directly influence top notification selection

## API Usage Examples

### Get Today's Digest
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/digest"
```

### Get Specific Date Digest
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/digest/date/2024-01-30"
```

### Get Weekly Overview
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/digest/weekly"
```

### Get Summary Statistics
```bash
curl -H "Authorization: Bearer <token>" \
  "https://api.notisync.com/api/v1/digest/summary"
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200 OK`: Successful digest generation
- `400 Bad Request`: Invalid date format
- `401 Unauthorized`: Authentication required
- `404 Not Found`: No data for requested date
- `500 Internal Server Error`: Server error

Error responses include descriptive messages:
```json
{
  "error": "Invalid date format. Use YYYY-MM-DD format."
}
```

## Performance Considerations

1. **Caching**: All digests are cached for 24 hours
2. **Lazy Loading**: Digests generated on-demand if not cached
3. **Batch Processing**: Weekly digests use parallel processing
4. **Database Optimization**: Efficient queries with proper indexing
5. **Memory Management**: Large datasets handled with pagination

## Testing

Run the daily digest test suite:

```bash
# Unit tests
go test ./internal/services -run TestDailyDigest
go test ./internal/api -run TestDigestHandlers

# Integration test
go run ./cmd/digest-test/main.go
```

## Configuration

The digest service uses existing database and Redis connections. Optional configuration:

```go
// Customize quiet day threshold
const QuietDayThreshold = 3

// Customize top notifications count
const TopNotificationsCount = 5

// Customize cache duration
const DigestCacheDuration = 24 * time.Hour
```

## Future Enhancements

Planned improvements for the digest system:

1. **Machine Learning**: Personalized importance scoring based on user behavior
2. **Email Delivery**: Optional email digest delivery
3. **Custom Scheduling**: User-configurable digest generation times
4. **Advanced Analytics**: Trend analysis and predictive insights
5. **Export Options**: PDF and email-friendly digest formats
6. **Team Digests**: Organizational-level digest aggregation