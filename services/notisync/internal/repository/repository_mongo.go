package repository

import (
	"github.com/notisync/backend/internal/database"
)

// MongoRepositories holds all MongoDB repository instances
type MongoRepositories struct {
	User                   *UserMongoRepository
	Device                 *DeviceMongoRepository
	Notification           *NotificationMongoRepository
	NotificationHistory    *NotificationHistoryMongoRepository
	UserRule               *UserRuleMongoRepository
	NotificationAction     *NotificationActionMongoRepository
}

// NewMongoRepositories creates a new instance of all MongoDB repositories
func NewMongoRepositories(db *database.MongoDB) *MongoRepositories {
	return &MongoRepositories{
		User:                NewUserMongoRepository(db),
		Device:              NewDeviceMongoRepository(db),
		Notification:        NewNotificationMongoRepository(db),
		NotificationHistory: NewNotificationHistoryMongoRepository(db),
		UserRule:            NewUserRuleMongoRepository(db),
		NotificationAction:  NewNotificationActionMongoRepository(db),
	}
}

// InterfaceRepositories holds all repository interfaces
type InterfaceRepositories struct {
	User                   UserRepositoryInterface
	Device                 DeviceRepositoryInterface
	Notification           NotificationRepositoryInterface
	NotificationHistory    NotificationHistoryRepositoryInterface
	UserRule               UserRuleRepositoryInterface
	NotificationAction     NotificationActionRepositoryInterface
}

// NewInterfaceRepositories creates repositories using interfaces (works with both SQL and MongoDB)
func NewInterfaceRepositories(mongoRepos *MongoRepositories) *InterfaceRepositories {
	return &InterfaceRepositories{
		User:                mongoRepos.User,
		Device:              mongoRepos.Device,
		Notification:        mongoRepos.Notification,
		NotificationHistory: mongoRepos.NotificationHistory,
		UserRule:            mongoRepos.UserRule,
		NotificationAction:  mongoRepos.NotificationAction,
	}
}