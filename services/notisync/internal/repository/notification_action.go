package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

type NotificationActionRepository struct {
	db *sql.DB
}

func NewNotificationActionRepository(db *sql.DB) *NotificationActionRepository {
	return &NotificationActionRepository{db: db}
}

func (r *NotificationActionRepository) Create(action *types.NotificationActionRecord) error {
	query := `
		INSERT INTO notification_actions (id, notification_id, device_id, action_type, timestamp)
		VALUES ($1, $2, $3, $4, $5)
	`
	
	action.ID = uuid.New()
	action.Timestamp = time.Now()

	_, err := r.db.Exec(query,
		action.ID, action.NotificationID, action.DeviceID,
		action.ActionType, action.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("failed to create notification action: %w", err)
	}

	return nil
}

func (r *NotificationActionRepository) GetByNotificationID(notificationID uuid.UUID) ([]*types.NotificationActionRecord, error) {
	query := `
		SELECT id, notification_id, device_id, action_type, timestamp
		FROM notification_actions
		WHERE notification_id = $1
		ORDER BY timestamp DESC
	`

	rows, err := r.db.Query(query, notificationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification actions: %w", err)
	}
	defer rows.Close()

	var actions []*types.NotificationActionRecord
	for rows.Next() {
		action := &types.NotificationActionRecord{}
		err := rows.Scan(
			&action.ID, &action.NotificationID, &action.DeviceID,
			&action.ActionType, &action.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification action: %w", err)
		}
		actions = append(actions, action)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notification actions: %w", err)
	}

	return actions, nil
}

// GetByDeviceIDWithPagination retrieves notification actions by device ID with pagination
func (r *NotificationActionRepository) GetByDeviceIDWithPagination(deviceID uuid.UUID, limit, offset int) ([]*types.NotificationActionRecord, error) {
	query := `
		SELECT id, notification_id, device_id, action_type, timestamp
		FROM notification_actions
		WHERE device_id = $1
		ORDER BY timestamp DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.Query(query, deviceID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification actions by device: %w", err)
	}
	defer rows.Close()

	var actions []*types.NotificationActionRecord
	for rows.Next() {
		action := &types.NotificationActionRecord{}
		err := rows.Scan(
			&action.ID, &action.NotificationID, &action.DeviceID,
			&action.ActionType, &action.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification action: %w", err)
		}
		actions = append(actions, action)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notification actions: %w", err)
	}

	return actions, nil
}

// GetByDeviceID retrieves notification actions by device ID (interface method)
func (r *NotificationActionRepository) GetByDeviceID(deviceID uuid.UUID) ([]*types.NotificationActionRecord, error) {
	query := `
		SELECT id, notification_id, device_id, action_type, timestamp
		FROM notification_actions
		WHERE device_id = $1
		ORDER BY timestamp DESC
	`

	rows, err := r.db.Query(query, deviceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification actions by device: %w", err)
	}
	defer rows.Close()

	var actions []*types.NotificationActionRecord
	for rows.Next() {
		action := &types.NotificationActionRecord{}
		err := rows.Scan(
			&action.ID, &action.NotificationID, &action.DeviceID,
			&action.ActionType, &action.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification action: %w", err)
		}
		actions = append(actions, action)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notification actions: %w", err)
	}

	return actions, nil
}

func (r *NotificationActionRepository) Delete(id uuid.UUID) error {
	query := `DELETE FROM notification_actions WHERE id = $1`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete notification action: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification action not found")
	}

	return nil
}

func (r *NotificationActionRepository) DeleteByNotificationID(notificationID uuid.UUID) error {
	query := `DELETE FROM notification_actions WHERE notification_id = $1`

	_, err := r.db.Exec(query, notificationID)
	if err != nil {
		return fmt.Errorf("failed to delete notification actions: %w", err)
	}

	return nil
}

// GetByID retrieves a notification action by ID (interface method)
func (r *NotificationActionRepository) GetByID(id uuid.UUID) (*types.NotificationActionRecord, error) {
	query := `
		SELECT id, notification_id, device_id, action_type, timestamp
		FROM notification_actions
		WHERE id = $1
	`

	action := &types.NotificationActionRecord{}
	err := r.db.QueryRow(query, id).Scan(
		&action.ID, &action.NotificationID, &action.DeviceID,
		&action.ActionType, &action.Timestamp,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("notification action not found")
		}
		return nil, fmt.Errorf("failed to get notification action by ID: %w", err)
	}

	return action, nil
}

// Update updates a notification action (interface method)
func (r *NotificationActionRepository) Update(action *types.NotificationActionRecord) error {
	query := `
		UPDATE notification_actions
		SET notification_id = $2, device_id = $3, action_type = $4, timestamp = $5
		WHERE id = $1
	`

	result, err := r.db.Exec(query,
		action.ID, action.NotificationID, action.DeviceID,
		action.ActionType, action.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("failed to update notification action: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("notification action not found")
	}

	return nil
}