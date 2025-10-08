package services

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockNotificationRepository for testing
type MockNotificationRepository struct {
	mock.Mock
}

func (m *MockNotificationRepository) Create(notification *types.Notification) error {
	args := m.Called(notification)
	return args.Error(0)
}

func (m *MockNotificationRepository) GetByID(id uuid.UUID) (*types.Notification, error) {
	args := m.Called(id)
	return args.Get(0).(*types.Notification), args.Error(1)
}

func (m *MockNotificationRepository) GetByUserID(userID uuid.UUID, limit, offset int) ([]*types.Notification, error) {
	args := m.Called(userID, limit, offset)
	return args.Get(0).([]*types.Notification), args.Error(1)
}

func (m *MockNotificationRepository) GetByCategory(userID uuid.UUID, category types.NotificationCategory, limit, offset int) ([]*types.Notification, error) {
	args := m.Called(userID, category, limit, offset)
	return args.Get(0).([]*types.Notification), args.Error(1)
}

func (m *MockNotificationRepository) Search(userID uuid.UUID, searchTerm string, limit, offset int) ([]*types.Notification, error) {
	args := m.Called(userID, searchTerm, limit, offset)
	return args.Get(0).([]*types.Notification), args.Error(1)
}

func (m *MockNotificationRepository) UpdateStatus(id uuid.UUID, isRead, isDismissed bool) error {
	args := m.Called(id, isRead, isDismissed)
	return args.Error(0)
}

func (m *MockNotificationRepository) Delete(id uuid.UUID) error {
	args := m.Called(id)
	return args.Error(0)
}

func (m *MockNotificationRepository) DeleteExpired() (int64, error) {
	args := m.Called()
	return args.Get(0).(int64), args.Error(1)
}

func (m *MockNotificationRepository) GetDailyStats(userID uuid.UUID, date time.Time) (map[string]int, error) {
	args := m.Called(userID, date)
	return args.Get(0).(map[string]int), args.Error(1)
}

func (m *MockNotificationRepository) GetHistory(userID uuid.UUID, filters repository.HistoryFilters) ([]*types.Notification, error) {
	args := m.Called(userID, filters)
	return args.Get(0).([]*types.Notification), args.Error(1)
}

func (m *MockNotificationRepository) GetHistoryCount(userID uuid.UUID, filters repository.HistoryFilters) (int, error) {
	args := m.Called(userID, filters)
	return args.Get(0).(int), args.Error(1)
}

func (m *MockNotificationRepository) GetAppNames(userID uuid.UUID) ([]string, error) {
	args := m.Called(userID)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockNotificationRepository) GetDateRange(userID uuid.UUID) (*time.Time, *time.Time, error) {
	args := m.Called(userID)
	return args.Get(0).(*time.Time), args.Get(1).(*time.Time), args.Error(2)
}

func (m *MockNotificationRepository) GetWeeklyStats(userID uuid.UUID, weeks int) (map[string]map[string]int, error) {
	args := m.Called(userID, weeks)
	return args.Get(0).(map[string]map[string]int), args.Error(1)
}

func TestNotificationProcessor_GetNotificationHistory(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	mockValidator := &MockNotificationValidator{}
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
		validator: mockValidator,
	}

	userID := uuid.New()
	filters := NotificationFilters{
		Category: "Work",
		Limit:    10,
		Offset:   0,
	}

	expectedNotifications := []*types.Notification{
		{
			ID:       uuid.New(),
			UserID:   userID,
			AppName:  "Slack",
			Title:    "Meeting reminder",
			Category: types.CategoryWork,
		},
	}

	historyFilters := repository.HistoryFilters{
		Category: "Work",
		Limit:    10,
		Offset:   0,
	}

	mockValidator.On("ValidateNotificationCategory", types.CategoryWork).Return(nil)
	mockRepo.On("GetHistory", userID, historyFilters).Return(expectedNotifications, nil)
	mockRepo.On("GetHistoryCount", userID, historyFilters).Return(1, nil)

	notifications, totalCount, err := processor.GetNotificationHistory(userID, filters)

	assert.NoError(t, err)
	assert.Equal(t, expectedNotifications, notifications)
	assert.Equal(t, 1, totalCount)

	mockRepo.AssertExpectations(t)
	mockValidator.AssertExpectations(t)
}

func TestNotificationProcessor_SearchNotifications(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	mockValidator := &MockNotificationValidator{}
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
		validator: mockValidator,
	}

	userID := uuid.New()
	query := "meeting"
	filters := NotificationFilters{
		Limit:  10,
		Offset: 0,
	}

	expectedNotifications := []*types.Notification{
		{
			ID:      uuid.New(),
			UserID:  userID,
			AppName: "Slack",
			Title:   "Meeting reminder",
		},
	}

	historyFilters := repository.HistoryFilters{
		Search: query,
		Limit:  10,
		Offset: 0,
	}

	mockRepo.On("GetHistory", userID, historyFilters).Return(expectedNotifications, nil)
	mockRepo.On("GetHistoryCount", userID, historyFilters).Return(1, nil)

	results, err := processor.SearchNotifications(userID, query, filters)

	assert.NoError(t, err)
	assert.Equal(t, query, results.Query)
	assert.Equal(t, expectedNotifications, results.Notifications)
	assert.Equal(t, 1, results.TotalCount)
	assert.Equal(t, 1, results.Page)
	assert.Equal(t, 10, results.PageSize)
	assert.Equal(t, 1, results.TotalPages)

	mockRepo.AssertExpectations(t)
}

func TestNotificationProcessor_GetNotificationSummary(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	mockValidator := &MockNotificationValidator{}
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
		validator: mockValidator,
	}

	userID := uuid.New()
	now := time.Now()
	minDate := now.AddDate(0, -1, 0) // 1 month ago
	maxDate := now

	// Mock date range
	mockRepo.On("GetDateRange", userID).Return(&minDate, &maxDate, nil)

	// Mock total count
	totalFilters := repository.HistoryFilters{}
	mockRepo.On("GetHistoryCount", userID, totalFilters).Return(100, nil)

	// Mock unread count
	isReadFalse := false
	unreadFilters := repository.HistoryFilters{IsRead: &isReadFalse}
	mockRepo.On("GetHistoryCount", userID, unreadFilters).Return(25, nil)

	// Mock dismissed count
	isDismissedTrue := true
	dismissedFilters := repository.HistoryFilters{IsDismissed: &isDismissedTrue}
	mockRepo.On("GetHistoryCount", userID, dismissedFilters).Return(10, nil)

	// Mock app names
	appNames := []string{"Slack", "WhatsApp", "Gmail"}
	mockRepo.On("GetAppNames", userID).Return(appNames, nil)

	// Mock today's stats
	todayStats := map[string]int{
		"Work":     5,
		"Personal": 3,
		"Junk":     2,
	}
	mockRepo.On("GetDailyStats", userID, mock.AnythingOfType("time.Time")).Return(todayStats, nil)

	summary, err := processor.GetNotificationSummary(userID)

	assert.NoError(t, err)
	assert.Equal(t, 100, summary.TotalCount)
	assert.Equal(t, 25, summary.UnreadCount)
	assert.Equal(t, 10, summary.DismissedCount)
	assert.Equal(t, 3, summary.AppCount)
	assert.Equal(t, &minDate, summary.EarliestDate)
	assert.Equal(t, &maxDate, summary.LatestDate)
	assert.Equal(t, 10, summary.TodayStats.Total)

	mockRepo.AssertExpectations(t)
}

func TestNotificationProcessor_GetWeeklyNotificationStats(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
	}

	userID := uuid.New()
	weeks := 4

	weeklyData := map[string]map[string]int{
		"2024-01-01": {
			"Work":     10,
			"Personal": 5,
			"Junk":     2,
		},
		"2024-01-08": {
			"Work":     8,
			"Personal": 7,
			"Junk":     3,
		},
	}

	mockRepo.On("GetWeeklyStats", userID, weeks).Return(weeklyData, nil)

	stats, err := processor.GetWeeklyNotificationStats(userID, weeks)

	assert.NoError(t, err)
	assert.Equal(t, 35, stats.TotalCount) // Sum of all notifications
	assert.Len(t, stats.Weeks, 2)

	// Check first week
	week1Found := false
	for _, week := range stats.Weeks {
		if week.WeekStart == "2024-01-01" {
			week1Found = true
			assert.Equal(t, 17, week.Total)
			assert.Equal(t, 10, week.Categories["Work"])
			assert.Equal(t, 5, week.Categories["Personal"])
			assert.Equal(t, 2, week.Categories["Junk"])
		}
	}
	assert.True(t, week1Found, "Week starting 2024-01-01 should be found")

	mockRepo.AssertExpectations(t)
}

func TestNotificationProcessor_GetNotificationAppNames(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
	}

	userID := uuid.New()
	expectedAppNames := []string{"Gmail", "Slack", "WhatsApp"}

	mockRepo.On("GetAppNames", userID).Return(expectedAppNames, nil)

	appNames, err := processor.GetNotificationAppNames(userID)

	assert.NoError(t, err)
	assert.Equal(t, expectedAppNames, appNames)

	mockRepo.AssertExpectations(t)
}

func TestNotificationProcessor_GetNotificationDateRange(t *testing.T) {
	mockRepo := new(MockNotificationRepository)
	
	processor := &NotificationProcessor{
		repos: &repository.Repositories{
			Notification: mockRepo,
		},
	}

	userID := uuid.New()
	minDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	maxDate := time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC)

	mockRepo.On("GetDateRange", userID).Return(&minDate, &maxDate, nil)

	min, max, err := processor.GetNotificationDateRange(userID)

	assert.NoError(t, err)
	assert.Equal(t, &minDate, min)
	assert.Equal(t, &maxDate, max)

	mockRepo.AssertExpectations(t)
}

func TestNotificationProcessor_SearchNotifications_ValidationErrors(t *testing.T) {
	processor := &NotificationProcessor{}

	userID := uuid.New()
	filters := NotificationFilters{}

	// Test empty query
	_, err := processor.SearchNotifications(userID, "", filters)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "search query is required")

	// Test short query
	_, err = processor.SearchNotifications(userID, "a", filters)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "search query must be at least 2 characters")
}

func TestNotificationProcessor_GetNotificationHistory_ValidationErrors(t *testing.T) {
	mockValidator := &MockNotificationValidator{}
	
	processor := &NotificationProcessor{
		validator: mockValidator,
	}

	userID := uuid.New()

	// Test short search term
	filters := NotificationFilters{Search: "a"}
	_, _, err := processor.GetNotificationHistory(userID, filters)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "search term must be at least 2 characters")

	// Test invalid category
	filters = NotificationFilters{Category: "InvalidCategory"}
	mockValidator.On("ValidateNotificationCategory", types.NotificationCategory("InvalidCategory")).Return(assert.AnError)
	
	_, _, err = processor.GetNotificationHistory(userID, filters)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid category")

	mockValidator.AssertExpectations(t)
}