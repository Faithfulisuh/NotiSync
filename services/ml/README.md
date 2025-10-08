# NotiSync Classification Service

A Python-based microservice for intelligent notification classification with machine learning capabilities.

## Overview

The Classification Service automatically categorizes notifications into three main categories:
- **Work**: Business, professional, and work-related notifications
- **Personal**: Personal messages, social media, and general notifications  
- **Junk**: Promotional, spam, and unwanted notifications

## Features

- **Keyword-based Classification**: Uses predefined keyword patterns for accurate categorization
- **Learning Capabilities**: Improves accuracy through user feedback
- **Redis Integration**: Persists learned patterns for continuous improvement
- **REST API**: Easy integration with other services
- **Comprehensive Testing**: Full test coverage with unit and integration tests

## API Endpoints

### Classification

#### `POST /classify`
Classify a notification into Work, Personal, or Junk category.

**Request:**
```json
{
  "app_name": "Slack",
  "title": "Meeting reminder",
  "body": "Team standup in 10 minutes"
}
```

**Response:**
```json
{
  "category": "Work",
  "confidence": 0.85,
  "reasoning": "Classified as Work: app 'Slack' matches work apps; contains work keywords: meeting",
  "matched_keywords": ["app:slack", "keyword:meeting"]
}
```

### Learning

#### `POST /feedback`
Submit user feedback to improve classification accuracy.

**Request:**
```json
{
  "app_name": "CustomApp",
  "title": "Project update",
  "body": "Quarterly report ready",
  "predicted_category": "Personal",
  "actual_category": "Work"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Feedback received: CustomApp → Work"
}
```

### Statistics

#### `GET /stats`
Get classification statistics and learned patterns.

**Response:**
```json
{
  "category_stats": {
    "Work": {
      "learned_apps": 5,
      "learned_content_patterns": 12,
      "top_apps": [["customapp", 0.9], ["workapp", 0.8]],
      "top_content_patterns": [["project", 0.7], ["meeting", 0.6]]
    }
  },
  "total_learned_patterns": 25,
  "redis_connected": true
}
```

### Utility Endpoints

#### `GET /health`
Health check endpoint.

#### `GET /categories`
Get available categories and descriptions.

#### `POST /reset`
Reset all learned patterns (for testing/cleanup).

## Classification Logic

### Keyword Matching

The service uses predefined keyword sets for each category:

**Work Keywords:**
- Apps: Slack, Teams, Outlook, Gmail, Zoom, Jira, etc.
- Content: meeting, project, deadline, client, urgent, etc.

**Personal Keywords:**
- Apps: WhatsApp, Instagram, Facebook, Spotify, etc.
- Content: friend, family, birthday, vacation, personal, etc.

**Junk Keywords:**
- Apps: marketing, promo, deals, advertisement, etc.
- Content: sale, discount, offer, buy now, limited time, etc.
- Patterns: "50% off", "free shipping", "$19.99", etc.

### Scoring System

1. **App Name Matching**: Higher weight (3.0 points)
2. **Content Keywords**: Medium weight (1.0 points)
3. **Regex Patterns**: High weight (2.0 points)
4. **Domain Matching**: Medium-high weight (1.5 points)

### Learning Algorithm

The service learns from user feedback by:
1. Storing app-specific corrections with confidence scores
2. Extracting content patterns from corrected notifications
3. Gradually increasing confidence with repeated feedback
4. Prioritizing learned patterns over default keywords

## Installation & Setup

### Prerequisites

- Python 3.11+
- Redis (optional, for learning capabilities)

### Local Development

1. **Install dependencies:**
   ```bash
   cd services/ml
   pip install -r requirements.txt
   ```

2. **Start Redis (optional):**
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

3. **Run the service:**
   ```bash
   python main.py
   ```

4. **Test the service:**
   ```bash
   # Run unit tests
   pytest test_classifier.py -v
   
   # Run API tests
   pytest test_api.py -v
   
   # Run example demo
   python example_usage.py
   ```

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t notisync-classification .
   ```

2. **Run with Docker Compose:**
   ```bash
   # From project root
   docker-compose up classification
   ```

## Environment Variables

- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)

## Usage Examples

### Basic Classification

```python
import requests

# Classify a work notification
response = requests.post("http://localhost:8081/classify", json={
    "app_name": "Slack",
    "title": "Meeting reminder",
    "body": "Team standup in 10 minutes"
})

result = response.json()
print(f"Category: {result['category']}")
print(f"Confidence: {result['confidence']}")
```

### Learning from Feedback

```python
# Provide feedback for better accuracy
requests.post("http://localhost:8081/feedback", json={
    "app_name": "CustomApp",
    "title": "Project update",
    "body": "Quarterly report ready",
    "predicted_category": "Personal",
    "actual_category": "Work"
})
```

### Integration with Go Backend

```go
type ClassificationRequest struct {
    AppName string `json:"app_name"`
    Title   string `json:"title"`
    Body    string `json:"body"`
}

type ClassificationResponse struct {
    Category         string   `json:"category"`
    Confidence       float64  `json:"confidence"`
    Reasoning        string   `json:"reasoning"`
    MatchedKeywords  []string `json:"matched_keywords"`
}

func classifyNotification(appName, title, body string) (*ClassificationResponse, error) {
    req := ClassificationRequest{
        AppName: appName,
        Title:   title,
        Body:    body,
    }
    
    jsonData, _ := json.Marshal(req)
    resp, err := http.Post("http://classification:8081/classify", 
        "application/json", bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var result ClassificationResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}
```

## Testing

The service includes comprehensive tests:

### Unit Tests (`test_classifier.py`)
- Classification accuracy for each category
- Learning algorithm functionality
- Edge cases and error handling
- Redis integration

### API Tests (`test_api.py`)
- All endpoint functionality
- Error handling and validation
- Integration workflows
- Performance under load

### Running Tests

```bash
# Run all tests
pytest -v

# Run specific test file
pytest test_classifier.py -v

# Run with coverage
pytest --cov=. --cov-report=html

# Run performance tests
pytest -k "performance" -v
```

## Performance

- **Classification Speed**: ~1-5ms per notification
- **Memory Usage**: ~50MB base + learned patterns
- **Throughput**: 1000+ classifications/second
- **Learning Storage**: Efficient Redis-based pattern storage

## Monitoring

The service provides several monitoring endpoints:

- `/health`: Service health and Redis connectivity
- `/stats`: Classification statistics and learned patterns
- Structured logging for all operations
- Error tracking and performance metrics

## Contributing

1. Follow PEP 8 style guidelines
2. Add tests for new features
3. Update documentation
4. Ensure Redis integration works properly

## License

Part of the NotiSync project - see main project LICENSE.