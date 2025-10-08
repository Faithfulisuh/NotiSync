package repository

import (
	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

// UserRepositoryInterface defines the interface for user operations
type UserRepositoryInterface interface {
	Create(user *types.User) error
	GetByID(id uuid.UUID) (*types.User, error)
	GetByEmail(email string) (*types.User, error)
	Update(user *types.User) error
	Delete(id uuid.UUID) error
}

// DeviceRepositoryInterface defines the interface for device operations
type DeviceRepositoryInterface interface {
	Create(device *types.Device) error
	GetByID(id uuid.UUID) (*types.Device, error)
	GetByUserID(userID uuid.UUID) ([]*types.Device, error)
	Update(device *types.Device) error
	UpdateLastSeen(id uuid.UUID) error
	Delete(id uuid.UUID) error
}

// NotificationRepositoryInterface defines the interface for notification operations
type NotificationRepositoryInterface interface {
	Create(notification *types.Notification) error
	GetByID(id uuid.UUID) (*types.Notification, error)
	GetByUserID(userID uuid.UUID, limit, offset int) ([]*types.Notification, error)
	Update(notification *types.Notification) error
	Delete(id uuid.UUID) error
	UpdateStatus(id uuid.UUID, status types.NotificationStatus) error
	GetUnreadCount(userID uuid.UUID) (int64, error)
	CleanupExpired() (int64, error)
	Search(userID uuid.UUID, query string, category string, limit, offset int) ([]*types.Notification, int64, error)
	GetStats(userID uuid.UUID, days int) (map[string]interface{}, error)
}

// NotificationHistoryRepositoryInterface defines the interface for notification history operations
type NotificationHistoryRepositoryInterface interface {
	GetHistory(userID uuid.UUID, filters map[string]interface{}, limit, offset int) ([]*types.Notification, int64, error)
	SearchHistory(userID uuid.UUID, query string, limit, offset int) ([]*types.Notification, int64, error)
	GetHistoryStats(userID uuid.UUID, days int) (map[string]interface{}, error)
	GetAppBreakdown(userID uuid.UUID, days int) ([]map[string]interface{}, error)
	CleanupExpired() (int64, error)
}

// UserRuleRepositoryInterface defines the interface for user rule operations
type UserRuleRepositoryInterface interface {
	Create(rule *types.UserRule) error
	GetByID(id uuid.UUID) (*types.UserRule, error)
	GetByUserID(userID uuid.UUID) ([]*types.UserRule, error)
	GetActiveByUserID(userID uuid.UUID) ([]*types.UserRule, error)
	Update(rule *types.UserRule) error
	Delete(id uuid.UUID) error
}

// NotificationActionRepositoryInterface defines the interface for notification action operations
type NotificationActionRepositoryInterface interface {
	Create(action *types.NotificationActionRecord) error
	GetByID(id uuid.UUID) (*types.NotificationActionRecord, error)
	GetByNotificationID(notificationID uuid.UUID) ([]*types.NotificationActionRecord, error)
	GetByDeviceID(deviceID uuid.UUID) ([]*types.NotificationActionRecord, error)
	Update(action *types.NotificationActionRecord) error
	Delete(id uuid.UUID) error
}

// Ensure MongoDB repositories implement the interfaces
var (
	_ UserRepositoryInterface                   = (*UserMongoRepository)(nil)
	_ DeviceRepositoryInterface                 = (*DeviceMongoRepository)(nil)
	_ NotificationRepositoryInterface           = (*NotificationMongoRepository)(nil)
	_ NotificationHistoryRepositoryInterface    = (*NotificationHistoryMongoRepository)(nil)
	_ UserRuleRepositoryInterface               = (*UserRuleMongoRepository)(nil)
	_ NotificationActionRepositoryInterface     = (*NotificationActionMongoRepository)(nil)
)

// Ensure SQL repositories implement the interfaces (for compatibility)
var (
	_ UserRepositoryInterface                = (*UserRepository)(nil)
	_ DeviceRepositoryInterface              = (*DeviceRepository)(nil)
	_ NotificationRepositoryInterface        = (*NotificationRepository)(nil)
	_ NotificationHistoryRepositoryInterface = (*NotificationHistoryRepository)(nil)
	_ UserRuleRepositoryInterface            = (*UserRuleRepository)(nil)
	_ NotificationActionRepositoryInterface  = (*NotificationActionRepository)(nil)
)