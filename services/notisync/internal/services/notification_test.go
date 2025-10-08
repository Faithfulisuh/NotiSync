package services

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

func TestNotificationService_CreateNotification(t *testing.T) {
	// Skip test - requires mock repositories
	t.Skip("Notification service tests require mock repository setup")

	// This would test:
	// 1. Valid notification creation
	// 2. Validation errors
	// 3. Device ownership verification
	// 4. Content sanitization
	// 5. Database persistence
}

func TestNotification_SetDefaults(t *testing.T) {
	notification := &types.Notification{
		UserID:         uuid.New(),
		SourceDeviceID: uuid.New(),
		AppName:        "TestApp",
		Title:          "Test Title",
		Body:           "Test Body",
	}

	notification.SetDefaults()

	if notification.Category != types.CategoryPersonal {
		t.Errorf("Expected default category to be Personal, got %s", notification.Category)
	}

	if notification.Priority != int(types.PriorityNormal) {
		t.Errorf("Expected default priority to be Normal (1), got %d", notification.Priority)
	}

	if notification.CreatedAt.IsZero() {
		t.Error("Expected CreatedAt to be set")
	}

	if notification.ExpiresAt.IsZero() {
		t.Error("Expected ExpiresAt to be set")
	}

	// Verify expires_at is 7 days from created_at
	expectedExpiry := notification.CreatedAt.Add(7 * 24 * time.Hour)
	if !notification.ExpiresAt.Equal(expectedExpiry) {
		t.Errorf("Expected expiry %v, got %v", expectedExpiry, notification.ExpiresAt)
	}
}

func TestNotification_Validate(t *testing.T) {
	tests := []struct {
		name         string
		notification *types.Notification
		expectError  bool
	}{
		{
			name: "valid notification",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Test Title",
				Body:           "Test Body",
				Category:       types.CategoryPersonal,
				Priority:       1,
			},
			expectError: false,
		},
		{
			name: "missing user_id",
			notification: &types.Notification{
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Test Title",
			},
			expectError: true,
		},
		{
			name: "empty app_name",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "",
				Title:          "Test Title",
			},
			expectError: true,
		},
		{
			name: "invalid category",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Test Title",
				Category:       "InvalidCategory",
			},
			expectError: true,
		},
		{
			name: "invalid priority",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Test Title",
				Priority:       5,
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.notification.Validate()

			if tt.expectError && err == nil {
				t.Error("Expected error but got none")
			} else if !tt.expectError && err != nil {
				t.Errorf("Expected no error but got: %v", err)
			}
		})
	}
}

func TestCreateNotificationRequest_ToNotification(t *testing.T) {
	userID := uuid.New()
	deviceID := uuid.New()

	req := &types.CreateNotificationRequest{
		AppName:  "TestApp",
		Title:    "Test Title",
		Body:     "Test Body",
		Category: types.CategoryWork,
		Priority: 2,
	}

	notification := req.ToNotification(userID, deviceID)

	if notification.UserID != userID {
		t.Errorf("Expected UserID %s, got %s", userID, notification.UserID)
	}

	if notification.SourceDeviceID != deviceID {
		t.Errorf("Expected SourceDeviceID %s, got %s", deviceID, notification.SourceDeviceID)
	}

	if notification.AppName != req.AppName {
		t.Errorf("Expected AppName %s, got %s", req.AppName, notification.AppName)
	}

	if notification.Title != req.Title {
		t.Errorf("Expected Title %s, got %s", req.Title, notification.Title)
	}

	if notification.Body != req.Body {
		t.Errorf("Expected Body %s, got %s", req.Body, notification.Body)
	}

	if notification.Category != req.Category {
		t.Errorf("Expected Category %s, got %s", req.Category, notification.Category)
	}

	if notification.Priority != req.Priority {
		t.Errorf("Expected Priority %d, got %d", req.Priority, notification.Priority)
	}

	// Verify defaults were set
	if notification.CreatedAt.IsZero() {
		t.Error("Expected CreatedAt to be set")
	}

	if notification.ExpiresAt.IsZero() {
		t.Error("Expected ExpiresAt to be set")
	}
}

func TestNotificationPriority_IsValid(t *testing.T) {
	tests := []struct {
		priority types.NotificationPriority
		expected bool
	}{
		{types.PriorityLow, true},
		{types.PriorityNormal, true},
		{types.PriorityHigh, true},
		{types.PriorityUrgent, true},
		{types.NotificationPriority(-1), false},
		{types.NotificationPriority(4), false},
		{types.NotificationPriority(10), false},
	}

	for _, tt := range tests {
		t.Run(string(rune(tt.priority)), func(t *testing.T) {
			result := tt.priority.IsValid()
			if result != tt.expected {
				t.Errorf("Expected IsValid() to return %v for priority %d, got %v", tt.expected, tt.priority, result)
			}
		})
	}
}

func TestNotificationCategory_IsValid(t *testing.T) {
	tests := []struct {
		category types.NotificationCategory
		expected bool
	}{
		{types.CategoryWork, true},
		{types.CategoryPersonal, true},
		{types.CategoryJunk, true},
		{"InvalidCategory", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(string(tt.category), func(t *testing.T) {
			result := tt.category.IsValid()
			if result != tt.expected {
				t.Errorf("Expected IsValid() to return %v for category %s, got %v", tt.expected, tt.category, result)
			}
		})
	}
}

func TestNotificationAction_IsValid(t *testing.T) {
	tests := []struct {
		action   types.NotificationAction
		expected bool
	}{
		{types.ActionRead, true},
		{types.ActionDismissed, true},
		{types.ActionClicked, true},
		{"invalid_action", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(string(tt.action), func(t *testing.T) {
			result := tt.action.IsValid()
			if result != tt.expected {
				t.Errorf("Expected IsValid() to return %v for action %s, got %v", tt.expected, tt.action, result)
			}
		})
	}
}