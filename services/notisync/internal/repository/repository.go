package repository

import (
	"database/sql"

	"github.com/notisync/backend/internal/database"
)

// Repositories holds all repository instances
type Repositories struct {
	User                   *UserRepository
	Device                 *DeviceRepository
	Notification           *NotificationRepository
	NotificationHistory    *NotificationHistoryRepository
	UserRule               *UserRuleRepository
	NotificationAction     *NotificationActionRepository
}

// NewRepositories creates a new instance of all repositories
func NewRepositories(db *database.DB) *Repositories {
	return &Repositories{
		User:                NewUserRepository(db.DB),
		Device:              NewDeviceRepository(db.DB),
		Notification:        NewNotificationRepository(db.DB),
		NotificationHistory: NewNotificationHistoryRepository(db.DB),
		UserRule:            NewUserRuleRepository(db.DB),
		NotificationAction:  NewNotificationActionRepository(db.DB),
	}
}

// Transaction executes a function within a database transaction
func (r *Repositories) Transaction(fn func(*sql.Tx) error) error {
	tx, err := r.User.db.Begin()
	if err != nil {
		return err
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		} else if err != nil {
			tx.Rollback()
		} else {
			err = tx.Commit()
		}
	}()

	err = fn(tx)
	return err
}