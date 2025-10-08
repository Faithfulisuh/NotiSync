package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

type DeviceRepository struct {
	db *sql.DB
}

func NewDeviceRepository(db *sql.DB) *DeviceRepository {
	return &DeviceRepository{db: db}
}

func (r *DeviceRepository) Create(device *types.Device) error {
	query := `
		INSERT INTO devices (id, user_id, device_name, device_type, push_token, last_seen, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	
	device.ID = uuid.New()
	device.LastSeen = time.Now()
	device.CreatedAt = time.Now()

	_, err := r.db.Exec(query, 
		device.ID, device.UserID, device.DeviceName, device.DeviceType, 
		device.PushToken, device.LastSeen, device.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create device: %w", err)
	}

	return nil
}

func (r *DeviceRepository) GetByID(id uuid.UUID) (*types.Device, error) {
	query := `
		SELECT id, user_id, device_name, device_type, push_token, last_seen, created_at
		FROM devices
		WHERE id = $1
	`

	device := &types.Device{}
	err := r.db.QueryRow(query, id).Scan(
		&device.ID, &device.UserID, &device.DeviceName, &device.DeviceType,
		&device.PushToken, &device.LastSeen, &device.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("device not found")
		}
		return nil, fmt.Errorf("failed to get device by ID: %w", err)
	}

	return device, nil
}

func (r *DeviceRepository) GetByUserID(userID uuid.UUID) ([]*types.Device, error) {
	query := `
		SELECT id, user_id, device_name, device_type, push_token, last_seen, created_at
		FROM devices
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get devices by user ID: %w", err)
	}
	defer rows.Close()

	var devices []*types.Device
	for rows.Next() {
		device := &types.Device{}
		err := rows.Scan(
			&device.ID, &device.UserID, &device.DeviceName, &device.DeviceType,
			&device.PushToken, &device.LastSeen, &device.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan device: %w", err)
		}
		devices = append(devices, device)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating devices: %w", err)
	}

	return devices, nil
}

func (r *DeviceRepository) Update(device *types.Device) error {
	query := `
		UPDATE devices
		SET device_name = $2, device_type = $3, push_token = $4, last_seen = $5
		WHERE id = $1
	`

	device.LastSeen = time.Now()

	result, err := r.db.Exec(query, 
		device.ID, device.DeviceName, device.DeviceType, device.PushToken, device.LastSeen,
	)
	if err != nil {
		return fmt.Errorf("failed to update device: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}

func (r *DeviceRepository) UpdateLastSeen(id uuid.UUID) error {
	query := `UPDATE devices SET last_seen = $2 WHERE id = $1`

	result, err := r.db.Exec(query, id, time.Now())
	if err != nil {
		return fmt.Errorf("failed to update device last seen: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}

func (r *DeviceRepository) Delete(id uuid.UUID) error {
	query := `DELETE FROM devices WHERE id = $1`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete device: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("device not found")
	}

	return nil
}