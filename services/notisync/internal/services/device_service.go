package services

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/repository"
	"github.com/notisync/backend/internal/types"
)

type DeviceService struct {
	repos *repository.InterfaceRepositories
}

func NewDeviceService(repos *repository.InterfaceRepositories) *DeviceService {
	return &DeviceService{
		repos: repos,
	}
}

// RegisterOrUpdateDevice registers a new device or updates an existing one
func (s *DeviceService) RegisterOrUpdateDevice(userID uuid.UUID, req *DeviceRegistrationRequest) (*types.Device, error) {
	// Validate device type
	if !req.Platform.IsValid() {
		return nil, fmt.Errorf("invalid device platform: %s", req.Platform)
	}

	// Check if device with same name already exists for this user
	existingDevices, err := s.repos.Device.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing devices: %w", err)
	}

	for _, existingDevice := range existingDevices {
		if existingDevice.DeviceName == req.Name {
			// Update existing device
			existingDevice.DeviceType = req.Platform
			existingDevice.PushToken = req.Token
			existingDevice.LastSeen = time.Now()

			if err := s.repos.Device.Update(existingDevice); err != nil {
				return nil, fmt.Errorf("failed to update existing device: %w", err)
			}

			return existingDevice, nil
		}
	}

	// Create new device
	device := &types.Device{
		UserID:     userID,
		DeviceName: req.Name,
		DeviceType: req.Platform,
		PushToken:  req.Token,
		LastSeen:   time.Now(),
	}

	if err := s.repos.Device.Create(device); err != nil {
		return nil, fmt.Errorf("failed to create device: %w", err)
	}

	return device, nil
}

// GetUserDevices returns all devices for a user
func (s *DeviceService) GetUserDevices(userID uuid.UUID) ([]*types.Device, error) {
	devices, err := s.repos.Device.GetByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user devices: %w", err)
	}

	return devices, nil
}

// UpdateDeviceLastSeen updates the last seen timestamp for a device
func (s *DeviceService) UpdateDeviceLastSeen(deviceID uuid.UUID) error {
	return s.repos.Device.UpdateLastSeen(deviceID)
}

// RemoveDevice removes a device for a user
func (s *DeviceService) RemoveDevice(userID, deviceID uuid.UUID) error {
	// Verify device belongs to user
	device, err := s.repos.Device.GetByID(deviceID)
	if err != nil {
		return fmt.Errorf("device not found: %w", err)
	}

	if device.UserID != userID {
		return fmt.Errorf("access denied: device does not belong to user")
	}

	if err := s.repos.Device.Delete(deviceID); err != nil {
		return fmt.Errorf("failed to delete device: %w", err)
	}

	return nil
}

// UpdateDevice updates device information
func (s *DeviceService) UpdateDevice(userID, deviceID uuid.UUID, updates *DeviceUpdateRequest) (*types.Device, error) {
	// Verify device belongs to user
	device, err := s.repos.Device.GetByID(deviceID)
	if err != nil {
		return nil, fmt.Errorf("device not found: %w", err)
	}

	if device.UserID != userID {
		return nil, fmt.Errorf("access denied: device does not belong to user")
	}

	// Update device fields
	if updates.Name != nil {
		device.DeviceName = *updates.Name
	}
	if updates.Platform != nil {
		if !updates.Platform.IsValid() {
			return nil, fmt.Errorf("invalid device platform: %s", *updates.Platform)
		}
		device.DeviceType = *updates.Platform
	}
	if updates.Token != nil {
		device.PushToken = updates.Token
	}

	device.LastSeen = time.Now()

	if err := s.repos.Device.Update(device); err != nil {
		return nil, fmt.Errorf("failed to update device: %w", err)
	}

	return device, nil
}

// DeviceRegistrationRequest represents a device registration request
type DeviceRegistrationRequest struct {
	Name      string           `json:"name" binding:"required"`
	Platform  types.DeviceType `json:"platform" binding:"required"`
	Token     *string          `json:"token,omitempty"`
	Model     *string          `json:"model,omitempty"`
	OSVersion *string          `json:"os_version,omitempty"`
}

// DeviceUpdateRequest represents a device update request
type DeviceUpdateRequest struct {
	Name      *string          `json:"name,omitempty"`
	Platform  *types.DeviceType `json:"platform,omitempty"`
	Token     *string          `json:"token,omitempty"`
	Model     *string          `json:"model,omitempty"`
	OSVersion *string          `json:"os_version,omitempty"`
}