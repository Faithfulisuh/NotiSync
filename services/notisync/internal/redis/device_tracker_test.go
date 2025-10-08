package redis

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeviceTracker_AddAndGetUserDevices(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	tracker := NewDeviceTracker(client)
	ctx := context.Background()

	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()

	// Add devices
	err := tracker.AddUserDevice(ctx, userID, deviceID1)
	assert.NoError(t, err)

	err = tracker.AddUserDevice(ctx, userID, deviceID2)
	assert.NoError(t, err)

	// Get devices
	devices, err := tracker.GetUserDevices(ctx, userID)
	assert.NoError(t, err)
	assert.Len(t, devices, 2)
	assert.Contains(t, devices, deviceID1)
	assert.Contains(t, devices, deviceID2)
}

func TestDeviceTracker_RemoveUserDevice(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	tracker := NewDeviceTracker(client)
	ctx := context.Background()

	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()

	// Add devices
	err := tracker.AddUserDevice(ctx, userID, deviceID1)
	assert.NoError(t, err)

	err = tracker.AddUserDevice(ctx, userID, deviceID2)
	assert.NoError(t, err)

	// Remove one device
	err = tracker.RemoveUserDevice(ctx, userID, deviceID1)
	assert.NoError(t, err)

	// Verify only one device remains
	devices, err := tracker.GetUserDevices(ctx, userID)
	assert.NoError(t, err)
	assert.Len(t, devices, 1)
	assert.Contains(t, devices, deviceID2)
	assert.NotContains(t, devices, deviceID1)
}

func TestDeviceTracker_SetAndGetDeviceConnection(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	tracker := NewDeviceTracker(client)
	ctx := context.Background()

	deviceID := uuid.New()
	connection := &DeviceConnection{
		DeviceID:  deviceID,
		SocketID:  "socket123",
		LastPing:  time.Now(),
		IsOnline:  true,
		UserAgent: "TestAgent/1.0",
	}

	// Set connection
	err := tracker.SetDeviceConnection(ctx, deviceID, connection)
	assert.NoError(t, err)

	// Get connection
	retrievedConnection, err := tracker.GetDeviceConnection(ctx, deviceID)
	assert.NoError(t, err)
	assert.NotNil(t, retrievedConnection)
	assert.Equal(t, connection.DeviceID, retrievedConnection.DeviceID)
	assert.Equal(t, connection.SocketID, retrievedConnection.SocketID)
	assert.Equal(t, connection.IsOnline, retrievedConnection.IsOnline)
	assert.Equal(t, connection.UserAgent, retrievedConnection.UserAgent)
}

func TestDeviceTracker_UpdateDeviceHeartbeat(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	tracker := NewDeviceTracker(client)
	ctx := context.Background()

	deviceID := uuid.New()

	// Update heartbeat for non-existent device (should create new connection)
	err := tracker.UpdateDeviceHeartbeat(ctx, deviceID)
	assert.NoError(t, err)

	// Verify connection was created
	connection, err := tracker.GetDeviceConnection(ctx, deviceID)
	assert.NoError(t, err)
	assert.NotNil(t, connection)
	assert.Equal(t, deviceID, connection.DeviceID)
	assert.True(t, connection.IsOnline)
	assert.WithinDuration(t, time.Now(), connection.LastPing, time.Second)
}

func TestDeviceTracker_GetOnlineDevicesForUser(t *testing.T) {
	client := setupTestRedis(t)
	defer client.Close()

	tracker := NewDeviceTracker(client)
	ctx := context.Background()

	userID := uuid.New()
	deviceID1 := uuid.New()
	deviceID2 := uuid.New()
	deviceID3 := uuid.New()

	// Add devices to user
	err := tracker.AddUserDevice(ctx, userID, deviceID1)
	require.NoError(t, err)
	err = tracker.AddUserDevice(ctx, userID, deviceID2)
	require.NoError(t, err)
	err = tracker.AddUserDevice(ctx, userID, deviceID3)
	require.NoError(t, err)

	// Set device connections (only device1 and device2 online)
	connection1 := &DeviceConnection{
		DeviceID: deviceID1,
		LastPing: time.Now(),
		IsOnline: true,
	}
	err = tracker.SetDeviceConnection(ctx, deviceID1, connection1)
	require.NoError(t, err)

	connection2 := &DeviceConnection{
		DeviceID: deviceID2,
		LastPing: time.Now(),
		IsOnline: true,
	}
	err = tracker.SetDeviceConnection(ctx, deviceID2, connection2)
	require.NoError(t, err)

	// device3 has no connection (offline)

	// Get online devices
	onlineDevices, err := tracker.GetOnlineDevicesForUser(ctx, userID)
	assert.NoError(t, err)
	assert.Len(t, onlineDevices, 2)
	assert.Contains(t, onlineDevices, deviceID1)
	assert.Contains(t, onlineDevices, deviceID2)
	assert.NotContains(t, onlineDevices, deviceID3)
}