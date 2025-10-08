package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/services"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockNotificationProcessor for testing
type MockNotificationProcessor struct {
	mock.Mock
}

func (m *MockNotificationProcessor) GetNotificationHistory(userID uuid.UUID, filters services.NotificationFilters) ([]*types.Notification, int, error) {
	args := m.Called(userID, filters)
	return args.Get(0).([]*types.Notification), args.Get(1).(int), args.Error(2)
}

func (m *MockNotificationProcessor) SearchNotifications(userID uuid.UUID, query string, filters services.NotificationFilters) (*services.SearchResults, error) {
	args := m.Called(userID, query, filters)
	return args.Get(0).(*services.SearchResults), args.Error(1)
}

func (m *MockNotificationProcessor) GetNotificationSummary(userID uuid.UUID) (*services.NotificationSummary, error) {
	args := m.Called(userID)
	return args.Get(0).(*services.NotificationSummary), args.Error(1)
}

func (m *MockNotificationProcessor) GetNotificationAppNames(userID uuid.UUID) ([]string, error) {
	args := m.Called(userID)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockNotificationProcessor) GetNotificationDateRange(userID uuid.UUID) (*time.Time, *time.Time, error) {
	args := m.Called(userID)
	return args.Get(0).(*time.Time), args.Get(1).(*time.Time), args.Error(2)
}

func (m *MockNotificationProcessor) GetWeeklyNotificationStats(userID uuid.UUID, weeks int) (*services.WeeklyStats, error) {
	args := m.Called(userID, weeks)
	return args.Get(0).(*services.WeeklyStats), args.Error(1)
}

func TestServer_getNotificationHistory(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	expectedNotifications := []*types.Notification{
		{
			ID:       uuid.New(),
			UserID:   userID,
			AppName:  "Slack",
			Title:    "Meeting reminder",
			Category: types.CategoryWork,
		},
	}

	filters := services.NotificationFilters{
		Category: "Work",
		Limit:    50,
		Offset:   0,
	}

	mockProcessor.On("GetNotificationHistory", userID, mock.MatchedBy(func(f services.NotificationFilters) bool {
		return f.Category == "Work" && f.Limit == 50 && f.Offset == 0
	})).Return(expectedNotifications, 1, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/history?category=Work", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getNotificationHistory(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	notifications := response["notifications"].([]interface{})
	assert.Len(t, notifications, 1)

	pagination := response["pagination"].(map[string]interface{})
	assert.Equal(t, float64(1), pagination["total_count"])
	assert.Equal(t, float64(1), pagination["total_pages"])

	mockProcessor.AssertExpectations(t)
}

func TestServer_searchNotifications(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	query := "meeting"
	
	expectedResults := &services.SearchResults{
		Query: query,
		Notifications: []*types.Notification{
			{
				ID:      uuid.New(),
				UserID:  userID,
				AppName: "Slack",
				Title:   "Meeting reminder",
			},
		},
		TotalCount: 1,
		Page:       1,
		PageSize:   50,
		TotalPages: 1,
	}

	mockProcessor.On("SearchNotifications", userID, query, mock.AnythingOfType("services.NotificationFilters")).Return(expectedResults, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/search?q=meeting", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.searchNotifications(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.SearchResults
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, query, response.Query)
	assert.Len(t, response.Notifications, 1)
	assert.Equal(t, 1, response.TotalCount)

	mockProcessor.AssertExpectations(t)
}

func TestServer_searchNotifications_MissingQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	server := &Server{}
	userID := uuid.New()

	// Create request without query parameter
	req, _ := http.NewRequest("GET", "/api/v1/notifications/search", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.searchNotifications(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response["error"], "Search query is required")
}

func TestServer_getNotificationSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	now := time.Now()
	
	expectedSummary := &services.NotificationSummary{
		TotalCount:     100,
		UnreadCount:    25,
		DismissedCount: 10,
		AppCount:       5,
		EarliestDate:   &now,
		LatestDate:     &now,
		TodayStats: &services.NotificationStats{
			Total:    10,
			Work:     5,
			Personal: 3,
			Junk:     2,
		},
	}

	mockProcessor.On("GetNotificationSummary", userID).Return(expectedSummary, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/summary", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getNotificationSummary(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.NotificationSummary
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, 100, response.TotalCount)
	assert.Equal(t, 25, response.UnreadCount)
	assert.Equal(t, 10, response.DismissedCount)
	assert.Equal(t, 5, response.AppCount)

	mockProcessor.AssertExpectations(t)
}

func TestServer_getNotificationAppNames(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	expectedAppNames := []string{"Gmail", "Slack", "WhatsApp"}

	mockProcessor.On("GetNotificationAppNames", userID).Return(expectedAppNames, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/apps", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getNotificationAppNames(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	appNames := response["app_names"].([]interface{})
	assert.Len(t, appNames, 3)
	assert.Contains(t, appNames, "Gmail")
	assert.Contains(t, appNames, "Slack")
	assert.Contains(t, appNames, "WhatsApp")

	mockProcessor.AssertExpectations(t)
}

func TestServer_getNotificationDateRange(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	minDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	maxDate := time.Date(2024, 1, 31, 0, 0, 0, 0, time.UTC)

	mockProcessor.On("GetNotificationDateRange", userID).Return(&minDate, &maxDate, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/date-range", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getNotificationDateRange(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.NotNil(t, response["earliest_date"])
	assert.NotNil(t, response["latest_date"])

	mockProcessor.AssertExpectations(t)
}

func TestServer_getWeeklyNotificationStats(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockProcessor := new(MockNotificationProcessor)
	server := &Server{
		notificationProcessor: mockProcessor,
	}

	userID := uuid.New()
	weeks := 4
	
	expectedStats := &services.WeeklyStats{
		Weeks: []services.WeekStat{
			{
				WeekStart: "2024-01-01",
				Categories: map[string]int{
					"Work":     10,
					"Personal": 5,
					"Junk":     2,
				},
				Total: 17,
			},
		},
		TotalCount: 17,
	}

	mockProcessor.On("GetWeeklyNotificationStats", userID, weeks).Return(expectedStats, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/notifications/weekly-stats?weeks=4", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	
	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getWeeklyNotificationStats(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.WeeklyStats
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, 17, response.TotalCount)
	assert.Len(t, response.Weeks, 1)
	assert.Equal(t, "2024-01-01", response.Weeks[0].WeekStart)
	assert.Equal(t, 17, response.Weeks[0].Total)

	mockProcessor.AssertExpectations(t)
}

func TestParseNotificationFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("Parse all filters", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/test?category=Work&app_name=Slack&search=meeting&is_read=true&is_dismissed=false&start_date=2024-01-01&end_date=2024-01-31&limit=25&offset=10", nil)
		
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req

		filters := parseNotificationFilters(c)

		assert.Equal(t, "Work", filters.Category)
		assert.Equal(t, "Slack", filters.AppName)
		assert.Equal(t, "meeting", filters.Search)
		assert.NotNil(t, filters.IsRead)
		assert.True(t, *filters.IsRead)
		assert.NotNil(t, filters.IsDismissed)
		assert.False(t, *filters.IsDismissed)
		assert.NotNil(t, filters.StartDate)
		assert.NotNil(t, filters.EndDate)
		assert.Equal(t, 25, filters.Limit)
		assert.Equal(t, 10, filters.Offset)
	})

	t.Run("Parse with defaults", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/test", nil)
		
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req

		filters := parseNotificationFilters(c)

		assert.Equal(t, "", filters.Category)
		assert.Equal(t, "", filters.AppName)
		assert.Equal(t, "", filters.Search)
		assert.Nil(t, filters.IsRead)
		assert.Nil(t, filters.IsDismissed)
		assert.Nil(t, filters.StartDate)
		assert.Nil(t, filters.EndDate)
		assert.Equal(t, 50, filters.Limit)
		assert.Equal(t, 0, filters.Offset)
	})

	t.Run("Parse with invalid values", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/test?limit=invalid&offset=-5&is_read=invalid&start_date=invalid", nil)
		
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req

		filters := parseNotificationFilters(c)

		assert.Equal(t, 50, filters.Limit)  // Should use default
		assert.Equal(t, 0, filters.Offset)  // Should use default
		assert.Nil(t, filters.IsRead)       // Should be nil for invalid boolean
		assert.Nil(t, filters.StartDate)    // Should be nil for invalid date
	})
}