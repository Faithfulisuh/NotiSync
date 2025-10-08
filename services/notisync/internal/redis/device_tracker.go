package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// DeviceConnection represents a device connection status
type DeviceConnection struct {
	DeviceID   uuid.UUID `json:"device_id"`
	SocketID   string    `json:"socket_id,omitempty"`
	LastPing   time.Time `json:"last_ping"`
	IsOnline   bool      `json:"is_online"`
	UserAgent  string    `json:"user_agent,omitempty"`
}

// DeviceTracker handles device connection tracking
type DeviceTracker struct {
	client *Client
}

// NewDeviceTracker creates a new device tracker service
func NewDeviceTracker(client *Client) *DeviceTracker {
	return &DeviceTracker{
		client: client,
	}
}

// AddUserDevice adds a device to a user's connected devices set
func (dt *DeviceTracker) AddUserDevice(ctx context.Context, userID, deviceID uuid.UUID) error {
	key := fmt.Sprintf("user:%s:devices", userID.String())
	
	err := dt.client.SAdd(ctx, key, deviceID.String()).Err()
	if err != nil {
		return fmt.Errorf("failed to add device to user set: %w", err)
	}

	// Set expiration for the user devices set (30 days)
	dt.client.Expire(ctx, key, 30*24*time.Hour)

	return nil
}

// RemoveUserDevice removes a device from a user's connected devices set
func (dt *DeviceTracker) RemoveUserDevice(ctx context.Context, userID, deviceID uuid.UUID) error {
	key := fmt.Sprintf("user:%s:devices", userID.String())
	
	err := dt.client.SRem(ctx, key, deviceID.String()).Err()
	if err != nil {
		return fmt.Errorf("failed to remove device from user set: %w", err)
	}

	// Also remove the device connection info
	return dt.RemoveDeviceConnection(ctx, deviceID)
}

// GetUserDevices retrieves all devices for a user
func (dt *DeviceTracker) GetUserDevices(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	key := fmt.Sprintf("user:%s:devices", userID.String())
	
	deviceStrings, err := dt.client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get user devices: %w", err)
	}

	devices := make([]uuid.UUID, 0, len(deviceStrings))
	for _, deviceStr := range deviceStrings {
		deviceID, err := uuid.Parse(deviceStr)
		if err != nil {
			continue // Skip invalid UUIDs
		}
		devices = append(devices, deviceID)
	}

	return devices, nil
}

// SetDeviceConnection sets the connection status for a device
func (dt *DeviceTracker) SetDeviceConnection(ctx context.Context, deviceID uuid.UUID, connection *DeviceConnection) error {
	key := fmt.Sprintf("device:%s:connection", deviceID.String())
	
	data, err := json.Marshal(connection)
	if err != nil {
		return fmt.Errorf("failed to marshal device connection: %w", err)
	}

	// Set with expiration (connection expires after 5 minutes of inactivity)
	err = dt.client.Set(ctx, key, data, 5*time.Minute).Err()
	if err != nil {
		return fmt.Errorf("failed to set device connection: %w", err)
	}

	return nil
}

// GetDeviceConnection retrieves the connection status for a device
func (dt *DeviceTracker) GetDeviceConnection(ctx context.Context, deviceID uuid.UUID) (*DeviceConnection, error) {
	key := fmt.Sprintf("device:%s:connection", deviceID.String())
	
	data, err := dt.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to get device connection: %w", err)
	}

	var connection DeviceConnection
	if err := json.Unmarshal([]byte(data), &connection); err != nil {
		return nil, fmt.Errorf("failed to unmarshal device connection: %w", err)
	}

	return &connection, nil
}

// RemoveDeviceConnection removes the connection status for a device
func (dt *DeviceTracker) RemoveDeviceConnection(ctx context.Context, deviceID uuid.UUID) error {
	key := fmt.Sprintf("device:%s:connection", deviceID.String())
	
	err := dt.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to remove device connection: %w", err)
	}

	return nil
}

// UpdateDeviceHeartbeat updates the last ping time for a device
func (dt *DeviceTracker) UpdateDeviceHeartbeat(ctx context.Context, deviceID uuid.UUID) error {
	connection, err := dt.GetDeviceConnection(ctx, deviceID)
	if err != nil {
		return err
	}

	if connection == nil {
		// Create new connection if it doesn't exist
		connection = &DeviceConnection{
			DeviceID: deviceID,
			IsOnline: true,
		}
	}

	connection.LastPing = time.Now()
	connection.IsOnline = true

	return dt.SetDeviceConnection(ctx, deviceID, connection)
}

// GetOnlineDevicesForUser retrieves all online devices for a user
func (dt *DeviceTracker) GetOnlineDevicesForUser(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	devices, err := dt.GetUserDevices(ctx, userID)
	if err != nil {
		return nil, err
	}

	var onlineDevices []uuid.UUID
	for _, deviceID := range devices {
		connection, err := dt.GetDeviceConnection(ctx, deviceID)
		if err != nil {
			continue // Skip devices with connection errors
		}

		if connection != nil && connection.IsOnline {
			// Check if the device is still considered online (last ping within 5 minutes)
			if time.Since(connection.LastPing) <= 5*time.Minute {
				onlineDevices = append(onlineDevices, deviceID)
			}
		}
	}

	return onlineDevices, nil
}