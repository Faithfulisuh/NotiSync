package validation

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

func TestNotificationValidator_ValidateNotification(t *testing.T) {
	validator := NewNotificationValidator()

	tests := []struct {
		name          string
		notification  *types.Notification
		expectError   bool
		errorContains string
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
			expectError:   true,
			errorContains: "user_id is required",
		},
		{
			name: "missing source_device_id",
			notification: &types.Notification{
				UserID:  uuid.New(),
				AppName: "TestApp",
				Title:   "Test Title",
			},
			expectError:   true,
			errorContains: "source_device_id is required",
		},
		{
			name: "missing app_name",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "",
				Title:          "Test Title",
			},
			expectError:   true,
			errorContains: "app_name is required",
		},
		{
			name: "app_name too long",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        strings.Repeat("a", 256),
				Title:          "Test Title",
			},
			expectError:   true,
			errorContains: "app_name exceeds maximum length",
		},
		{
			name: "title too long",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          strings.Repeat("a", 501),
			},
			expectError:   true,
			errorContains: "title exceeds maximum length",
		},
		{
			name: "body too long",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Test Title",
				Body:           strings.Repeat("a", 2001),
			},
			expectError:   true,
			errorContains: "body exceeds maximum length",
		},
		{
			name: "suspicious content in title",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "Click here <script>alert('xss')</script>",
				Body:           "Test Body",
			},
			expectError:   true,
			errorContains: "suspicious patterns",
		},
		{
			name: "empty title and body",
			notification: &types.Notification{
				UserID:         uuid.New(),
				SourceDeviceID: uuid.New(),
				AppName:        "TestApp",
				Title:          "",
				Body:           "",
			},
			expectError:   true,
			errorContains: "must have either title or body",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validator.ValidateNotification(tt.notification)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
				} else if !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("Expected error to contain '%s', got '%s'", tt.errorContains, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
				}
			}
		})
	}
}

func TestNotificationValidator_ValidateCreateRequest(t *testing.T) {
	validator := NewNotificationValidator()

	tests := []struct {
		name          string
		request       *types.CreateNotificationRequest
		expectError   bool
		errorContains string
	}{
		{
			name: "valid request",
			request: &types.CreateNotificationRequest{
				AppName:  "TestApp",
				Title:    "Test Title",
				Body:     "Test Body",
				Category: types.CategoryPersonal,
				Priority: 1,
			},
			expectError: false,
		},
		{
			name: "invalid app name with special characters",
			request: &types.CreateNotificationRequest{
				AppName: "Test@App#",
				Title:   "Test Title",
			},
			expectError:   true,
			errorContains: "invalid characters",
		},
		{
			name: "reserved app name",
			request: &types.CreateNotificationRequest{
				AppName: "system",
				Title:   "Test Title",
			},
			expectError:   true,
			errorContains: "reserved",
		},
		{
			name: "invalid category",
			request: &types.CreateNotificationRequest{
				AppName:  "TestApp",
				Title:    "Test Title",
				Category: "InvalidCategory",
			},
			expectError:   true,
			errorContains: "invalid category",
		},
		{
			name: "invalid priority",
			request: &types.CreateNotificationRequest{
				AppName:  "TestApp",
				Title:    "Test Title",
				Priority: 5,
			},
			expectError:   true,
			errorContains: "priority must be between 0 and 3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validator.ValidateCreateRequest(tt.request)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error but got none")
				} else if !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("Expected error to contain '%s', got '%s'", tt.errorContains, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error but got: %v", err)
				}
			}
		})
	}
}

func TestNotificationValidator_SanitizeNotification(t *testing.T) {
	validator := NewNotificationValidator()

	notification := &types.Notification{
		AppName: "  Test App  ",
		Title:   "<script>alert('xss')</script>Important Message",
		Body:    "This is a   test   with   extra   spaces",
	}

	validator.SanitizeNotification(notification)

	if notification.AppName != "Test App" {
		t.Errorf("Expected sanitized app name 'Test App', got '%s'", notification.AppName)
	}

	if notification.Title != "Important Message" {
		t.Errorf("Expected sanitized title 'Important Message', got '%s'", notification.Title)
	}

	if notification.Body != "This is a test with extra spaces" {
		t.Errorf("Expected sanitized body 'This is a test with extra spaces', got '%s'", notification.Body)
	}
}

func TestNotification_ContainsOTP(t *testing.T) {
	tests := []struct {
		name         string
		notification *types.Notification
		expected     bool
	}{
		{
			name: "contains OTP in title",
			notification: &types.Notification{
				Title: "Your OTP is 123456",
				Body:  "Please use this code to verify your account",
			},
			expected: true,
		},
		{
			name: "contains verification code in body",
			notification: &types.Notification{
				Title: "Security Alert",
				Body:  "Your verification code is 789012",
			},
			expected: true,
		},
		{
			name: "contains 2FA in title",
			notification: &types.Notification{
				Title: "2FA Code Required",
				Body:  "Please enter the code from your authenticator app",
			},
			expected: true,
		},
		{
			name: "no OTP content",
			notification: &types.Notification{
				Title: "Welcome to our app",
				Body:  "Thank you for signing up!",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.notification.ContainsOTP()
			if result != tt.expected {
				t.Errorf("Expected ContainsOTP() to return %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestNotification_IsPromotional(t *testing.T) {
	tests := []struct {
		name         string
		notification *types.Notification
		expected     bool
	}{
		{
			name: "contains sale in title",
			notification: &types.Notification{
				Title: "Big Sale - 50% Off Everything!",
				Body:  "Don't miss out on our amazing deals",
			},
			expected: true,
		},
		{
			name: "contains discount in body",
			notification: &types.Notification{
				Title: "Special Offer",
				Body:  "Get 20% discount on your next purchase",
			},
			expected: true,
		},
		{
			name: "contains unsubscribe",
			notification: &types.Notification{
				Title: "Newsletter Update",
				Body:  "Click here to unsubscribe from our mailing list",
			},
			expected: true,
		},
		{
			name: "not promotional",
			notification: &types.Notification{
				Title: "Your order has shipped",
				Body:  "Your package will arrive tomorrow",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.notification.IsPromotional()
			if result != tt.expected {
				t.Errorf("Expected IsPromotional() to return %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestNotification_UpdateStatus(t *testing.T) {
	notification := &types.Notification{}

	// Test setting to read
	err := notification.UpdateStatus(types.StatusRead)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if !notification.IsRead || notification.IsDismissed {
		t.Error("Expected notification to be read but not dismissed")
	}

	// Test setting to dismissed
	err = notification.UpdateStatus(types.StatusDismissed)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if !notification.IsRead || !notification.IsDismissed {
		t.Error("Expected notification to be read and dismissed")
	}

	// Test setting to unread
	err = notification.UpdateStatus(types.StatusUnread)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if notification.IsRead || notification.IsDismissed {
		t.Error("Expected notification to be unread and not dismissed")
	}

	// Test invalid status
	err = notification.UpdateStatus("invalid")
	if err == nil {
		t.Error("Expected error for invalid status")
	}
}