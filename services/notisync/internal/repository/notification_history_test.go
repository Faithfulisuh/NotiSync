package repository

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNotificationHistoryRepository_SearchNotifications(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	repo := NewNotificationHistoryRepository(db)
	userID := uuid.New()

	// Create test notifications
	notifications := []*types.Notification{
		{
			ID:          uuid.New(),
			UserID:      userID,
			AppName:     "Slack",
			Title:       "Work meeting",
			Body:        "Team standup in 10 minutes",
			Category:    types.CategoryWork,
			IsRead:      false,
			IsDismissed: false,
			CreatedAt:   time.Now().AddDate(0, 0, -1), // Yesterday
		},
		{
			ID:          uuid.New(),
			UserID:      userID,
			AppName:     "WhatsApp",
			Title:       "Personal message",
			Body:        "How are you?",
			Category:    types.CategoryPersonal,
			IsRead:      true,
			IsDismissed: false,
			CreatedAt:   time.Now().AddDate(0, 0, -2), // 2 days ago
		},
		{
			ID:          uuid.New(),
			UserID:      userID,
			AppName:     "Shopping",
			Title:       "Sale alert",
			Body:        "50% off everything!",
			Category:    types.CategoryJunk,
			IsRead:      false,
			IsDismissed: true,
			CreatedAt:   time.Now().AddDate(0, 0, -3), // 3 days ago
		},
	}

	// Insert test notifications
	for _, notification := range notifications {
		err := repo.Create(notification)
		require.NoError(t, err)
	}

	t.Run("GetHistory with no filters", func(t *testing.T) {
		filters := HistoryFilters{
			Limit:  10,
			Offset: 0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 3)
		
		// Should be ordered by created_at DESC
		assert.True(t, results[0].CreatedAt.After(results[1].CreatedAt))
		assert.True(t, results[1].CreatedAt.After(results[2].CreatedAt))
	})

	t.Run("GetHistory with category filter", func(t *testing.T) {
		filters := HistoryFilters{
			Category: string(types.CategoryWork),
			Limit:    10,
			Offset:   0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		assert.Equal(t, "Slack", results[0].AppName)
	})

	t.Run("GetHistory with app name filter", func(t *testing.T) {
		filters := HistoryFilters{
			AppName: "WhatsApp",
			Limit:   10,
			Offset:  0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		assert.Equal(t, "WhatsApp", results[0].AppName)
	})

	t.Run("GetHistory with search filter", func(t *testing.T) {
		filters := HistoryFilters{
			Search: "meeting",
			Limit:  10,
			Offset: 0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		assert.Contains(t, results[0].Title, "meeting")
	})

	t.Run("GetHistory with read status filter", func(t *testing.T) {
		isRead := true
		filters := HistoryFilters{
			IsRead: &isRead,
			Limit:  10,
			Offset: 0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		assert.True(t, results[0].IsRead)
	})

	t.Run("GetHistory with dismissed status filter", func(t *testing.T) {
		isDismissed := true
		filters := HistoryFilters{
			IsDismissed: &isDismissed,
			Limit:       10,
			Offset:      0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		assert.True(t, results[0].IsDismissed)
	})

	t.Run("GetHistory with date range filter", func(t *testing.T) {
		startDate := time.Now().AddDate(0, 0, -2) // 2 days ago
		endDate := time.Now()                     // Now
		
		filters := HistoryFilters{
			StartDate: &startDate,
			EndDate:   &endDate,
			Limit:     10,
			Offset:    0,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 2) // Should exclude the 3-day-old notification
	})

	t.Run("GetHistory with pagination", func(t *testing.T) {
		filters := HistoryFilters{
			Limit:  1,
			Offset: 1,
		}

		results, err := repo.GetHistory(userID, filters)
		assert.NoError(t, err)
		assert.Len(t, results, 1)
		// Should be the second notification (by creation date DESC)
	})
}

func TestNotificationRepository_GetHistoryCount(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Create test notifications
	notifications := []*types.Notification{
		{
			ID:       uuid.New(),
			UserID:   userID,
			AppName:  "Slack",
			Title:    "Work meeting",
			Category: types.CategoryWork,
		},
		{
			ID:       uuid.New(),
			UserID:   userID,
			AppName:  "WhatsApp",
			Title:    "Personal message",
			Category: types.CategoryPersonal,
		},
	}

	for _, notification := range notifications {
		err := repo.Create(notification)
		require.NoError(t, err)
	}

	t.Run("GetHistoryCount with no filters", func(t *testing.T) {
		filters := HistoryFilters{}
		count, err := repo.GetHistoryCount(userID, filters)
		assert.NoError(t, err)
		assert.Equal(t, 2, count)
	})

	t.Run("GetHistoryCount with category filter", func(t *testing.T) {
		filters := HistoryFilters{
			Category: string(types.CategoryWork),
		}
		count, err := repo.GetHistoryCount(userID, filters)
		assert.NoError(t, err)
		assert.Equal(t, 1, count)
	})
}

func TestNotificationRepository_GetAppNames(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Create test notifications with different app names
	appNames := []string{"Slack", "WhatsApp", "Gmail", "Slack"} // Slack appears twice
	for _, appName := range appNames {
		notification := &types.Notification{
			ID:      uuid.New(),
			UserID:  userID,
			AppName: appName,
			Title:   "Test notification",
		}
		err := repo.Create(notification)
		require.NoError(t, err)
	}

	results, err := repo.GetAppNames(userID)
	assert.NoError(t, err)
	assert.Len(t, results, 3) // Should be unique
	assert.Contains(t, results, "Slack")
	assert.Contains(t, results, "WhatsApp")
	assert.Contains(t, results, "Gmail")
}

func TestNotificationRepository_GetDateRange(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Test with no notifications
	t.Run("GetDateRange with no notifications", func(t *testing.T) {
		min, max, err := repo.GetDateRange(userID)
		assert.NoError(t, err)
		assert.Nil(t, min)
		assert.Nil(t, max)
	})

	// Create test notifications with different dates
	oldDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	newDate := time.Date(2024, 1, 31, 0, 0, 0, 0, time.UTC)

	notifications := []*types.Notification{
		{
			ID:        uuid.New(),
			UserID:    userID,
			AppName:   "App1",
			Title:     "Old notification",
			CreatedAt: oldDate,
		},
		{
			ID:        uuid.New(),
			UserID:    userID,
			AppName:   "App2",
			Title:     "New notification",
			CreatedAt: newDate,
		},
	}

	for _, notification := range notifications {
		// Manually insert to control created_at
		query := `
			INSERT INTO notifications (id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`
		_, err := db.Exec(query,
			notification.ID, notification.UserID, uuid.New(),
			notification.AppName, notification.Title, "",
			types.CategoryPersonal, 0, false, false,
			notification.CreatedAt, notification.CreatedAt.Add(7*24*time.Hour),
		)
		require.NoError(t, err)
	}

	t.Run("GetDateRange with notifications", func(t *testing.T) {
		min, max, err := repo.GetDateRange(userID)
		assert.NoError(t, err)
		assert.NotNil(t, min)
		assert.NotNil(t, max)
		assert.Equal(t, oldDate.Unix(), min.Unix())
		assert.Equal(t, newDate.Unix(), max.Unix())
	})
}

func TestNotificationRepository_GetWeeklyStats(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Create test notifications for different weeks
	now := time.Now()
	thisWeek := now
	lastWeek := now.AddDate(0, 0, -7)

	notifications := []*types.Notification{
		{
			ID:        uuid.New(),
			UserID:    userID,
			AppName:   "Slack",
			Title:     "Work notification",
			Category:  types.CategoryWork,
			CreatedAt: thisWeek,
		},
		{
			ID:        uuid.New(),
			UserID:    userID,
			AppName:   "WhatsApp",
			Title:     "Personal notification",
			Category:  types.CategoryPersonal,
			CreatedAt: thisWeek,
		},
		{
			ID:        uuid.New(),
			UserID:    userID,
			AppName:   "Slack",
			Title:     "Another work notification",
			Category:  types.CategoryWork,
			CreatedAt: lastWeek,
		},
	}

	for _, notification := range notifications {
		// Manually insert to control created_at
		query := `
			INSERT INTO notifications (id, user_id, source_device_id, app_name, title, body, category, priority, is_read, is_dismissed, created_at, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`
		_, err := db.Exec(query,
			notification.ID, notification.UserID, uuid.New(),
			notification.AppName, notification.Title, "",
			notification.Category, 0, false, false,
			notification.CreatedAt, notification.CreatedAt.Add(7*24*time.Hour),
		)
		require.NoError(t, err)
	}

	stats, err := repo.GetWeeklyStats(userID, 4)
	assert.NoError(t, err)
	assert.NotEmpty(t, stats)

	// Check that we have stats for at least one week
	totalNotifications := 0
	for _, weekStats := range stats {
		for _, count := range weekStats {
			totalNotifications += count
		}
	}
	assert.Equal(t, 3, totalNotifications)
}

// setupTestDB creates a test database connection
// Note: This is a placeholder - in a real test, you'd set up a test database
func setupTestDB(t *testing.T) *sql.DB {
	// This is a mock implementation
	// In a real test, you would:
	// 1. Create a test database
	// 2. Run migrations
	// 3. Return the connection
	
	// For now, we'll skip the actual database tests
	t.Skip("Database tests require a test database setup")
	return nil
}