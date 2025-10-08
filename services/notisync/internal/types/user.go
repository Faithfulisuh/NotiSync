package types

import (
	"time"

	"github.com/google/uuid"
)

type DeviceType string

const (
	DeviceTypeMobile  DeviceType = "mobile"
	DeviceTypeWeb     DeviceType = "web"
	DeviceTypeDesktop DeviceType = "desktop"
)

// IsValid checks if the device type is valid
func (dt DeviceType) IsValid() bool {
	switch dt {
	case DeviceTypeMobile, DeviceTypeWeb, DeviceTypeDesktop:
		return true
	default:
		return false
	}
}

type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type Device struct {
	ID         uuid.UUID  `json:"id" db:"id"`
	UserID     uuid.UUID  `json:"user_id" db:"user_id"`
	DeviceName string     `json:"device_name" db:"device_name"`
	DeviceType DeviceType `json:"device_type" db:"device_type"`
	PushToken  *string    `json:"push_token,omitempty" db:"push_token"`
	LastSeen   time.Time  `json:"last_seen" db:"last_seen"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
}

type UserRule struct {
	ID         uuid.UUID   `json:"id" db:"id"`
	UserID     uuid.UUID   `json:"user_id" db:"user_id"`
	RuleName   string      `json:"rule_name" db:"rule_name"`
	RuleType   string      `json:"rule_type" db:"rule_type"`
	Conditions interface{} `json:"conditions" db:"conditions"`
	Actions    interface{} `json:"actions" db:"actions"`
	IsActive   bool        `json:"is_active" db:"is_active"`
	CreatedAt  time.Time   `json:"created_at" db:"created_at"`
}