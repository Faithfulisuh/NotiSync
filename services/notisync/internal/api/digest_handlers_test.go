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

// MockDailyDigestService for testing
type MockDailyDigestService struct {
	mock.Mock
}

func (m *MockDailyDigestService) GenerateDailyDigest(userID uuid.UUID, date time.Time) (*services.DailyDigest, error) {
	args := m.Called(userID, date)
	return args.Get(0).(*services.DailyDigest), args.Error(1)
}

func (m *MockDailyDigestService) GetTodaysDigest(userID uuid.UUID) (*services.DailyDigest, error) {
	args := m.Called(userID)
	return args.Get(0).(*services.DailyDigest), args.Error(1)
}

func (m *MockDailyDigestService) GetDigestForDate(userID uuid.UUID, dateStr string) (*services.DailyDigest, error) {
	args := m.Called(userID, dateStr)
	return args.Get(0).(*services.DailyDigest), args.Error(1)
}

func (m *MockDailyDigestService) GetWeeklyDigests(userID uuid.UUID) ([]*services.DailyDigest, error) {
	args := m.Called(userID)
	return args.Get(0).([]*services.DailyDigest), args.Error(1)
}

func TestServer_getDailyDigest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockDigestService := new(MockDailyDigestService)
	server := &Server{
		digestService: mockDigestService,
	}

	userID := uuid.New()
	expectedDigest := &services.DailyDigest{
		UserID:             userID,
		Date:               time.Now().Format("2006-01-02"),
		TotalNotifications: 5,
		CategoryBreakdown: map[string]int{
			"Work":     3,
			"Personal": 2,
		},
		TopNotifications: []*types.Notification{
			{
				ID:       uuid.New(),
				UserID:   userID,
				AppName:  "Slack",
				Title:    "Meeting reminder",
				Category: types.CategoryWork,
			},
		},
		Statistics: &services.DigestStatistics{
			TotalReceived: 5,
			TotalRead:     3,
			ReadRate:      60.0,
		},
		IsQuietDay:  false,
		GeneratedAt: time.Now(),
	}

	mockDigestService.On("GetTodaysDigest", userID).Return(expectedDigest, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/digest", nil)
	req.Header.Set("Authorization", "Bearer valid-token")

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getDailyDigest(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.DailyDigest
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, userID, response.UserID)
	assert.Equal(t, 5, response.TotalNotifications)
	assert.Equal(t, 3, response.CategoryBreakdown["Work"])
	assert.Equal(t, 2, response.CategoryBreakdown["Personal"])
	assert.False(t, response.IsQuietDay)

	mockDigestService.AssertExpectations(t)
}

func TestServer_getDailyDigest_QuietDay(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockDigestService := new(MockDailyDigestService)
	server := &Server{
		digestService: mockDigestService,
	}

	userID := uuid.New()
	expectedDigest := &services.DailyDigest{
		UserID:             userID,
		Date:               time.Now().Format("2006-01-02"),
		TotalNotifications: 1,
		CategoryBreakdown: map[string]int{
			"Personal": 1,
		},
		TopNotifications: []*types.Notification{},
		IsQuietDay:       true,
		QuietDayMessage:  "What a peaceful day! You had minimal notifications today.",
		GeneratedAt:      time.Now(),
	}

	mockDigestService.On("GetTodaysDigest", userID).Return(expectedDigest, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/digest", nil)

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getDailyDigest(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.DailyDigest
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.True(t, response.IsQuietDay)
	assert.NotEmpty(t, response.QuietDayMessage)
	assert.Equal(t, 1, response.TotalNotifications)

	mockDigestService.AssertExpectations(t)
}

func TestServer_getDigestForDate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockDigestService := new(MockDailyDigestService)
	server := &Server{
		digestService: mockDigestService,
	}

	userID := uuid.New()
	dateStr := "2024-01-15"
	expectedDigest := &services.DailyDigest{
		UserID:             userID,
		Date:               dateStr,
		TotalNotifications: 8,
		CategoryBreakdown: map[string]int{
			"Work": 5,
			"Junk": 3,
		},
		GeneratedAt: time.Now(),
	}

	mockDigestService.On("GetDigestForDate", userID, dateStr).Return(expectedDigest, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/digest/date/2024-01-15", nil)

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Params = []gin.Param{{Key: "date", Value: dateStr}}
	c.Set("user_id", userID)

	server.getDigestForDate(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response services.DailyDigest
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, dateStr, response.Date)
	assert.Equal(t, 8, response.TotalNotifications)

	mockDigestService.AssertExpectations(t)
}

func TestServer_getDigestForDate_InvalidDate(t *testing.T) {
	gin.SetMode(gin.TestMode)

	server := &Server{}
	userID := uuid.New()

	// Create request with invalid date
	req, _ := http.NewRequest("GET", "/api/v1/digest/date/invalid-date", nil)

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Params = []gin.Param{{Key: "date", Value: "invalid-date"}}
	c.Set("user_id", userID)

	server.getDigestForDate(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Contains(t, response["error"], "Invalid date format")
}

func TestServer_getWeeklyDigests(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockDigestService := new(MockDailyDigestService)
	server := &Server{
		digestService: mockDigestService,
	}

	userID := uuid.New()
	expectedDigests := []*services.DailyDigest{
		{
			UserID:             userID,
			Date:               "2024-01-15",
			TotalNotifications: 5,
			IsQuietDay:         false,
		},
		{
			UserID:             userID,
			Date:               "2024-01-16",
			TotalNotifications: 2,
			IsQuietDay:         true,
		},
		{
			UserID:             userID,
			Date:               "2024-01-17",
			TotalNotifications: 8,
			IsQuietDay:         false,
		},
	}

	mockDigestService.On("GetWeeklyDigests", userID).Return(expectedDigests, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/digest/weekly", nil)

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getWeeklyDigests(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	digests := response["digests"].([]interface{})
	assert.Len(t, digests, 3)
	assert.Equal(t, "7 days", response["period"])

	mockDigestService.AssertExpectations(t)
}

func TestServer_getDigestSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mockDigestService := new(MockDailyDigestService)
	server := &Server{
		digestService: mockDigestService,
	}

	userID := uuid.New()
	expectedDigests := []*services.DailyDigest{
		{
			UserID:             userID,
			Date:               "2024-01-15",
			TotalNotifications: 5,
			CategoryBreakdown: map[string]int{
				"Work":     3,
				"Personal": 2,
			},
			IsQuietDay: false,
		},
		{
			UserID:             userID,
			Date:               "2024-01-16",
			TotalNotifications: 2,
			CategoryBreakdown: map[string]int{
				"Personal": 2,
			},
			IsQuietDay: true,
		},
		{
			UserID:             userID,
			Date:               "2024-01-17",
			TotalNotifications: 8,
			CategoryBreakdown: map[string]int{
				"Work": 5,
				"Junk": 3,
			},
			IsQuietDay: false,
		},
	}

	mockDigestService.On("GetWeeklyDigests", userID).Return(expectedDigests, nil)

	// Create request
	req, _ := http.NewRequest("GET", "/api/v1/digest/summary", nil)

	// Mock auth context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", userID)

	server.getDigestSummary(c)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, float64(3), response["total_days"])
	assert.Equal(t, float64(15), response["total_notifications"]) // 5 + 2 + 8
	assert.Equal(t, 5.0, response["average_per_day"])             // 15 / 3
	assert.Equal(t, float64(1), response["quiet_days"])

	categoryTotals := response["category_totals"].(map[string]interface{})
	assert.Equal(t, float64(8), categoryTotals["Work"])     // 3 + 5
	assert.Equal(t, float64(4), categoryTotals["Personal"]) // 2 + 2
	assert.Equal(t, float64(3), categoryTotals["Junk"])     // 3

	busiestDay := response["busiest_day"].(map[string]interface{})
	assert.Equal(t, "2024-01-17", busiestDay["date"])
	assert.Equal(t, float64(8), busiestDay["count"])

	mockDigestService.AssertExpectations(t)
}

func TestServer_getDailyDigest_Unauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)

	server := &Server{}

	// Create request without authentication
	req, _ := http.NewRequest("GET", "/api/v1/digest", nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	// Don't set user_id to simulate unauthorized request

	server.getDailyDigest(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "User not authenticated", response["error"])
}

func TestCalculateDigestSummary(t *testing.T) {
	t.Run("Empty digests", func(t *testing.T) {
		summary := calculateDigestSummary([]*services.DailyDigest{})

		assert.Equal(t, 0, summary["total_days"])
		assert.Equal(t, 0, summary["total_notifications"])
		assert.Equal(t, 0.0, summary["average_per_day"])
		assert.Equal(t, 0, summary["quiet_days"])
		assert.Nil(t, summary["busiest_day"])
	})

	t.Run("Multiple digests", func(t *testing.T) {
		digests := []*services.DailyDigest{
			{
				Date:               "2024-01-15",
				TotalNotifications: 5,
				CategoryBreakdown: map[string]int{
					"Work":     3,
					"Personal": 2,
				},
				IsQuietDay: false,
			},
			{
				Date:               "2024-01-16",
				TotalNotifications: 2,
				CategoryBreakdown: map[string]int{
					"Personal": 2,
				},
				IsQuietDay: true,
			},
			{
				Date:               "2024-01-17",
				TotalNotifications: 10,
				CategoryBreakdown: map[string]int{
					"Work": 7,
					"Junk": 3,
				},
				IsQuietDay: false,
			},
		}

		summary := calculateDigestSummary(digests)

		assert.Equal(t, 3, summary["total_days"])
		assert.Equal(t, 17, summary["total_notifications"]) // 5 + 2 + 10
		assert.Equal(t, 17.0/3.0, summary["average_per_day"])
		assert.Equal(t, 1, summary["quiet_days"])
		assert.Equal(t, "2024-01-15", summary["period_start"])
		assert.Equal(t, "2024-01-17", summary["period_end"])

		categoryTotals := summary["category_totals"].(map[string]int)
		assert.Equal(t, 10, categoryTotals["Work"])     // 3 + 7
		assert.Equal(t, 4, categoryTotals["Personal"])  // 2 + 2
		assert.Equal(t, 3, categoryTotals["Junk"])      // 3

		busiestDay := summary["busiest_day"].(map[string]interface{})
		assert.Equal(t, "2024-01-17", busiestDay["date"])
		assert.Equal(t, 10, busiestDay["count"])
	})
}