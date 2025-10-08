package services

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
	"github.com/stretchr/testify/assert"
)

// Simple test implementations - these are unit tests for the digest logic only

// TestDailyDigestService_GenerateDailyDigest tests the digest generation logic
// Note: This is a simplified test that focuses on the core logic
func TestDailyDigestService_GenerateDailyDigest_Logic(t *testing.T) {
	// This test will be implemented when we have proper database setup
	// For now, we'll test the individual components
	t.Skip("Integration test - requires database setup")
}

func TestDailyDigestService_GenerateDailyDigest_QuietDay(t *testing.T) {
	t.Skip("Integration test - requires database setup")
}

func TestDailyDigestService_CalculateNotificationScore(t *testing.T) {
	service := &DailyDigestService{}

	userRules := []*types.UserRule{
		{
			RuleName: "Work Priority",
			RuleType: "app_filter",
			Conditions: map[string]interface{}{
				"app_filter": "Slack",
			},
			Actions: map[string]interface{}{
				"type": "priority_boost",
			},
			IsActive: true,
		},
		{
			RuleName: "Mute Shopping",
			RuleType: "app_filter",
			Conditions: map[string]interface{}{
				"app_filter": "Shopping",
			},
			Actions: map[string]interface{}{
				"type": "mute",
			},
			IsActive: true,
		},
	}

	t.Run("Work notification with priority", func(t *testing.T) {
		notification := &types.Notification{
			AppName:     "Slack",
			Title:       "Important Meeting",
			Body:        "Team meeting in 5 minutes",
			Category:    types.CategoryWork,
			Priority:    2,
			IsRead:      false,
			IsDismissed: false,
			CreatedAt:   time.Now().Add(-1 * time.Hour),
		}

		score, reasons := service.calculateNotificationScore(notification, userRules)

		assert.Greater(t, score, 5.0) // Should have high score
		assert.Contains(t, reasons, "Work notification")
		assert.Contains(t, reasons, "High priority (2)")
		assert.Contains(t, reasons, "Unread")
		assert.Contains(t, reasons, "Priority boost rule")
	})

	t.Run("Security notification", func(t *testing.T) {
		notification := &types.Notification{
			AppName:  "Banking App",
			Title:    "OTP Verification",
			Body:     "Your verification code is 123456",
			Category: types.CategoryPersonal,
			Priority: 0,
			IsRead:   false,
		}

		score, reasons := service.calculateNotificationScore(notification, userRules)

		assert.Greater(t, score, 10.0) // Security notifications get highest score
		assert.Contains(t, reasons, "Security/OTP notification")
	})

	t.Run("Muted notification", func(t *testing.T) {
		notification := &types.Notification{
			AppName:  "Shopping",
			Title:    "Sale Alert",
			Body:     "50% off everything",
			Category: types.CategoryJunk,
			Priority: 0,
			IsRead:   true,
		}

		score, reasons := service.calculateNotificationScore(notification, userRules)

		assert.Less(t, score, 2.0) // Should have low score due to muting
		assert.Contains(t, reasons, "Muted by rule")
	})
}

func TestDailyDigestService_GenerateStatistics(t *testing.T) {
	service := &DailyDigestService{}

	userID := uuid.New()
	testDate := time.Date(2024, 1, 15, 12, 0, 0, 0, time.UTC)

	notifications := []*types.Notification{
		{
			AppName:     "Slack",
			IsRead:      true,
			IsDismissed: false,
			CreatedAt:   testDate.Add(-2 * time.Hour), // 10 AM
		},
		{
			AppName:     "Slack",
			IsRead:      false,
			IsDismissed: true,
			CreatedAt:   testDate.Add(-1 * time.Hour), // 11 AM
		},
		{
			AppName:     "WhatsApp",
			IsRead:      true,
			IsDismissed: false,
			CreatedAt:   testDate.Add(-2 * time.Hour), // 10 AM
		},
	}

	stats, err := service.generateStatistics(userID, notifications, testDate)

	assert.NoError(t, err)
	assert.NotNil(t, stats)
	assert.Equal(t, 3, stats.TotalReceived)
	assert.Equal(t, 2, stats.TotalRead)
	assert.Equal(t, 1, stats.TotalDismissed)
	assert.Equal(t, 3, stats.TotalActedUpon) // 2 read + 1 dismissed
	assert.Equal(t, float64(200)/3, stats.ReadRate)    // 2/3 * 100
	assert.Equal(t, float64(100)/3, stats.DismissalRate) // 1/3 * 100
	assert.Equal(t, 100.0, stats.ActionRate)           // 3/3 * 100

	// Check app breakdown
	assert.Equal(t, 2, stats.AppBreakdown["Slack"])
	assert.Equal(t, 1, stats.AppBreakdown["WhatsApp"])
	assert.Equal(t, "Slack", stats.MostActiveApp)

	// Check hourly breakdown
	assert.Equal(t, 2, stats.HourlyBreakdown[10]) // 10 AM
	assert.Equal(t, 1, stats.HourlyBreakdown[11]) // 11 AM
	assert.Equal(t, 10, stats.MostActiveHour)
}

func TestDailyDigestService_IsSecurityNotification(t *testing.T) {
	service := &DailyDigestService{}

	testCases := []struct {
		title    string
		body     string
		expected bool
	}{
		{"OTP Code", "Your verification code is 123456", true},
		{"Login Alert", "New login detected from Chrome", true},
		{"Two-Factor Authentication", "Please verify your identity", true},
		{"Password Reset", "Click here to reset your password", true},
		{"Regular Message", "How are you doing today?", false},
		{"Shopping Alert", "50% off everything in store", false},
		{"Meeting Reminder", "Team standup in 10 minutes", false},
	}

	for _, tc := range testCases {
		t.Run(tc.title, func(t *testing.T) {
			notification := &types.Notification{
				Title: tc.title,
				Body:  tc.body,
			}

			result := service.isSecurityNotification(notification)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestDailyDigestService_GenerateQuietDayMessage(t *testing.T) {
	service := &DailyDigestService{}

	// Test zero notifications
	message := service.generateQuietDayMessage(0)
	assert.Contains(t, message, "Complete silence")

	// Test few notifications
	message = service.generateQuietDayMessage(2)
	assert.NotEmpty(t, message)
	assert.Contains(t, message, "peaceful")
}

func TestDailyDigestService_GetTodaysDigest(t *testing.T) {
	t.Skip("Integration test - requires database setup")
}