package services

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/redis"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
	"github.com/notisync/backend/internal/validation"
)

type NotificationService struct {
	repos        *repository.InterfaceRepositories
	redisService *redis.Service
	validator    *validation.NotificationValidator
	processor    *NotificationProcessor
}

func NewNotificationService(repos *repository.InterfaceRepositories, redisService *redis.Service) *NotificationService {
	return &NotificationService{
		repos:        repos,
		redisService: redisService,
		validator:    validation.NewNotificationValidator(),
		processor:    NewNotificationProcessor(repos, redisService),
	}
}

// CreateNotification creates a new notification with validation
func (s *NotificationService) CreateNotification(userID, deviceID uuid.UUID, req *types.CreateNotificationRequest) (*types.Notification, error) {
	return s.processor.ProcessIncomingNotification(userID, deviceID, req)
}

// GetNotifications retrieves notifications for a user with pagination
func (s *NotificationService) GetNotifications(userID uuid.UUID, limit, offset int) ([]*types.Notification, error) {
	filters := NotificationFilters{
		Limit:  limit,
		Offset: offset,
	}
	return s.processor.GetNotificationsForUser(userID, filters)
}

// GetNotificationsByCategory retrieves notifications by category
func (s *NotificationService) GetNotificationsByCategory(userID uuid.UUID, category types.NotificationCategory, limit, offset int) ([]*types.Notification, error) {
	filters := NotificationFilters{
		Category: string(category),
		Limit:    limit,
		Offset:   offset,
	}
	return s.processor.GetNotificationsForUser(userID, filters)
}

// SearchNotifications searches notifications by content
func (s *NotificationService) SearchNotifications(userID uuid.UUID, searchTerm string, limit, offset int) ([]*types.Notification, error) {
	filters := NotificationFilters{
		Search: searchTerm,
		Limit:  limit,
		Offset: offset,
	}
	return s.processor.GetNotificationsForUser(userID, filters)
}

// UpdateNotificationStatus updates the status of a notification
func (s *NotificationService) UpdateNotificationStatus(userID, notificationID uuid.UUID, action types.NotificationAction, deviceID uuid.UUID) error {
	return s.processor.ProcessNotificationAction(userID, notificationID, deviceID, action)
}

// GetNotificationHistory retrieves notification history with search
func (s *NotificationService) GetNotificationHistory(userID uuid.UUID, searchTerm string, limit, offset int) ([]*types.Notification, error) {
	// Use the notification history service instead
	return s.repos.Notification.GetByUserID(userID, limit, offset)
}

// DeleteNotification deletes a notification (soft delete by marking as expired)
func (s *NotificationService) DeleteNotification(userID, notificationID uuid.UUID) error {
	// Get notification and verify ownership
	notification, err := s.repos.Notification.GetByID(notificationID)
	if err != nil {
		return fmt.Errorf("notification not found: %w", err)
	}

	if notification.UserID != userID {
		return fmt.Errorf("notification does not belong to user")
	}

	// Delete notification
	if err := s.repos.Notification.Delete(notificationID); err != nil {
		return fmt.Errorf("failed to delete notification: %w", err)
	}

	return nil
}

// GetDailyStats retrieves daily notification statistics
func (s *NotificationService) GetDailyStats(userID uuid.UUID, date time.Time) (*NotificationStats, error) {
	return s.processor.GetNotificationStats(userID, date)
}

// CleanupExpiredNotifications removes expired notifications
func (s *NotificationService) CleanupExpiredNotifications() (int64, error) {
	return s.processor.CleanupExpiredNotifications()
}

// GetNotificationActions retrieves actions for a notification
func (s *NotificationService) GetNotificationActions(userID, notificationID uuid.UUID) ([]*types.NotificationActionRecord, error) {
	// Verify notification belongs to user
	notification, err := s.repos.Notification.GetByID(notificationID)
	if err != nil {
		return nil, fmt.Errorf("notification not found: %w", err)
	}

	if notification.UserID != userID {
		return nil, fmt.Errorf("notification does not belong to user")
	}

	actions, err := s.repos.NotificationAction.GetByNotificationID(notificationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification actions: %w", err)
	}

	return actions, nil
}