package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

func TestNotificationRepository_Create(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewNotificationRepository(db)

	notification := &types.Notification{
		UserID:         uuid.New(),
		SourceDeviceID: uuid.New(),
		AppName:        "TestApp",
		Title:          "Test Notification",
		Body:           "This is a test notification",
		Category:       types.CategoryPersonal,
		Priority:       1,
	}

	err := repo.Create(notification)
	if err != nil {
		t.Fatalf("Failed to create notification: %v", err)
	}

	// Verify notification was created with ID and timestamps
	if notification.ID == uuid.Nil {
		t.Error("Notification ID should be set after creation")
	}

	if notification.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set after creation")
	}

	if notification.ExpiresAt.IsZero() {
		t.Error("ExpiresAt should be set after creation")
	}

	// Verify expires_at is 7 days from created_at
	expectedExpiry := notification.CreatedAt.Add(7 * 24 * time.Hour)
	if !notification.ExpiresAt.Equal(expectedExpiry) {
		t.Errorf("Expected expiry %v, got %v", expectedExpiry, notification.ExpiresAt)
	}
}

func TestNotificationRepository_GetByUserID(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Create multiple notifications for the user
	notifications := []*types.Notification{
		{
			UserID:         userID,
			SourceDeviceID: uuid.New(),
			AppName:        "App1",
			Title:          "Notification 1",
			Category:       types.CategoryWork,
		},
		{
			UserID:         userID,
			SourceDeviceID: uuid.New(),
			AppName:        "App2",
			Title:          "Notification 2",
			Category:       types.CategoryPersonal,
		},
	}

	for _, notification := range notifications {
		err := repo.Create(notification)
		if err != nil {
			t.Fatalf("Failed to create notification: %v", err)
		}
	}

	// Retrieve notifications for the user
	retrievedNotifications, err := repo.GetByUserID(userID, 10, 0)
	if err != nil {
		t.Fatalf("Failed to get notifications by user ID: %v", err)
	}

	if len(retrievedNotifications) != 2 {
		t.Errorf("Expected 2 notifications, got %d", len(retrievedNotifications))
	}

	// Verify notifications are ordered by created_at DESC
	if len(retrievedNotifications) >= 2 {
		if retrievedNotifications[0].CreatedAt.Before(retrievedNotifications[1].CreatedAt) {
			t.Error("Notifications should be ordered by created_at DESC")
		}
	}
}

func TestNotificationRepository_UpdateStatus(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewNotificationRepository(db)

	notification := &types.Notification{
		UserID:         uuid.New(),
		SourceDeviceID: uuid.New(),
		AppName:        "TestApp",
		Title:          "Test Notification",
		Category:       types.CategoryPersonal,
	}

	err := repo.Create(notification)
	if err != nil {
		t.Fatalf("Failed to create notification: %v", err)
	}

	// Update notification status
	err = repo.UpdateStatus(notification.ID, true, false)
	if err != nil {
		t.Fatalf("Failed to update notification status: %v", err)
	}

	// Retrieve and verify the update
	retrievedNotification, err := repo.GetByID(notification.ID)
	if err != nil {
		t.Fatalf("Failed to get updated notification: %v", err)
	}

	if !retrievedNotification.IsRead {
		t.Error("Notification should be marked as read")
	}

	if retrievedNotification.IsDismissed {
		t.Error("Notification should not be marked as dismissed")
	}
}

func TestNotificationRepository_Search(t *testing.T) {
	db := setupTestDB(t)
	if db == nil {
		return
	}
	defer db.Close()

	repo := NewNotificationRepository(db)
	userID := uuid.New()

	// Create notifications with different content
	notifications := []*types.Notification{
		{
			UserID:         userID,
			SourceDeviceID: uuid.New(),
			AppName:        "Gmail",
			Title:          "New email from John",
			Body:           "Meeting tomorrow at 10 AM",
			Category:       types.CategoryWork,
		},
		{
			UserID:         userID,
			SourceDeviceID: uuid.New(),
			AppName:        "Slack",
			Title:          "Message in #general",
			Body:           "Coffee break anyone?",
			Category:       types.CategoryWork,
		},
		{
			UserID:         userID,
			SourceDeviceID: uuid.New(),
			AppName:        "Instagram",
			Title:          "New follower",
			Body:           "Someone started following you",
			Category:       types.CategoryPersonal,
		},
	}

	for _, notification := range notifications {
		err := repo.Create(notification)
		if err != nil {
			t.Fatalf("Failed to create notification: %v", err)
		}
	}

	// Search for notifications containing "email"
	results, err := repo.Search(userID, "email", 10, 0)
	if err != nil {
		t.Fatalf("Failed to search notifications: %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 result for 'email' search, got %d", len(results))
	}

	if len(results) > 0 && results[0].AppName != "Gmail" {
		t.Errorf("Expected Gmail notification, got %s", results[0].AppName)
	}

	// Search for notifications containing "Message"
	results, err = repo.Search(userID, "Message", 10, 0)
	if err != nil {
		t.Fatalf("Failed to search notifications: %v", err)
	}

	if len(results) != 1 {
		t.Errorf("Expected 1 result for 'Message' search, got %d", len(results))
	}
}