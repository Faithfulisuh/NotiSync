package types

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type NotificationCategory string

const (
	CategoryWork     NotificationCategory = "Work"
	CategoryPersonal NotificationCategory = "Personal"
	CategoryJunk     NotificationCategory = "Junk"
)

// IsValid checks if the notification category is valid
func (nc NotificationCategory) IsValid() bool {
	switch nc {
	case CategoryWork, CategoryPersonal, CategoryJunk:
		return true
	default:
		return false
	}
}

type NotificationStatus string

const (
	StatusUnread    NotificationStatus = "unread"
	StatusRead      NotificationStatus = "read"
	StatusDismissed NotificationStatus = "dismissed"
)

// IsValid checks if the notification status is valid
func (ns NotificationStatus) IsValid() bool {
	switch ns {
	case StatusUnread, StatusRead, StatusDismissed:
		return true
	default:
		return false
	}
}

type NotificationAction string

const (
	ActionRead      NotificationAction = "read"
	ActionDismissed NotificationAction = "dismissed"
	ActionClicked   NotificationAction = "clicked"
)

// IsValid checks if the notification action is valid
func (na NotificationAction) IsValid() bool {
	switch na {
	case ActionRead, ActionDismissed, ActionClicked:
		return true
	default:
		return false
	}
}

type NotificationPriority int

const (
	PriorityLow    NotificationPriority = 0
	PriorityNormal NotificationPriority = 1
	PriorityHigh   NotificationPriority = 2
	PriorityUrgent NotificationPriority = 3
)

// IsValid checks if the notification priority is valid
func (np NotificationPriority) IsValid() bool {
	return np >= PriorityLow && np <= PriorityUrgent
}

type Notification struct {
	ID             uuid.UUID            `json:"id" bson:"_id"`
	UserID         uuid.UUID            `json:"user_id" bson:"user_id" binding:"required"`
	SourceDeviceID uuid.UUID            `json:"source_device_id" bson:"source_device_id" binding:"required"`
	AppName        string               `json:"app_name" bson:"app_name" binding:"required,max=255"`
	Title          string               `json:"title" bson:"title" binding:"max=500"`
	Body           string               `json:"body" bson:"body" binding:"max=2000"`
	Category       NotificationCategory `json:"category" bson:"category"`
	Priority       int                  `json:"priority" bson:"priority" binding:"min=0,max=3"`
	IsRead         bool                 `json:"is_read" bson:"is_read"`
	IsDismissed    bool                 `json:"is_dismissed" bson:"is_dismissed"`
	CreatedAt      time.Time            `json:"created_at" bson:"created_at"`
	ExpiresAt      time.Time            `json:"expires_at" bson:"expires_at"`
}

// Validate performs comprehensive validation on the notification
func (n *Notification) Validate() error {
	if n.UserID == uuid.Nil {
		return fmt.Errorf("user_id is required")
	}

	if n.SourceDeviceID == uuid.Nil {
		return fmt.Errorf("source_device_id is required")
	}

	if strings.TrimSpace(n.AppName) == "" {
		return fmt.Errorf("app_name is required")
	}

	if len(n.AppName) > 255 {
		return fmt.Errorf("app_name must be 255 characters or less")
	}

	if len(n.Title) > 500 {
		return fmt.Errorf("title must be 500 characters or less")
	}

	if len(n.Body) > 2000 {
		return fmt.Errorf("body must be 2000 characters or less")
	}

	if n.Category != "" && !n.Category.IsValid() {
		return fmt.Errorf("invalid category: %s", n.Category)
	}

	if !NotificationPriority(n.Priority).IsValid() {
		return fmt.Errorf("priority must be between 0 and 3")
	}

	return nil
}

// IsExpired checks if the notification has expired
func (n *Notification) IsExpired() bool {
	return time.Now().After(n.ExpiresAt)
}

// SetDefaults sets default values for the notification
func (n *Notification) SetDefaults() {
	if n.Category == "" {
		n.Category = CategoryPersonal
	}

	if n.Priority == 0 {
		n.Priority = int(PriorityNormal)
	}

	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now()
	}

	if n.ExpiresAt.IsZero() {
		n.ExpiresAt = n.CreatedAt.Add(7 * 24 * time.Hour) // 7 days
	}
}

// GetStatus returns the current status of the notification
func (n *Notification) GetStatus() NotificationStatus {
	if n.IsDismissed {
		return StatusDismissed
	}
	if n.IsRead {
		return StatusRead
	}
	return StatusUnread
}

// UpdateStatus updates the notification status
func (n *Notification) UpdateStatus(status NotificationStatus) error {
	if !status.IsValid() {
		return fmt.Errorf("invalid status: %s", status)
	}

	switch status {
	case StatusRead:
		n.IsRead = true
		n.IsDismissed = false
	case StatusDismissed:
		n.IsRead = true
		n.IsDismissed = true
	case StatusUnread:
		n.IsRead = false
		n.IsDismissed = false
	}

	return nil
}

// ContainsOTP checks if the notification contains OTP-related content
func (n *Notification) ContainsOTP() bool {
	otpKeywords := []string{
		"otp", "verification code", "security code", "auth code",
		"login code", "2fa", "two-factor", "verify", "confirmation code",
	}

	content := strings.ToLower(n.Title + " " + n.Body)
	for _, keyword := range otpKeywords {
		if strings.Contains(content, keyword) {
			return true
		}
	}

	return false
}

// IsPromotional checks if the notification appears to be promotional
func (n *Notification) IsPromotional() bool {
	promotionalKeywords := []string{
		"sale", "discount", "offer", "deal", "promotion", "coupon",
		"limited time", "buy now", "shop", "free shipping", "% off",
		"unsubscribe", "marketing", "newsletter",
	}

	content := strings.ToLower(n.Title + " " + n.Body)
	for _, keyword := range promotionalKeywords {
		if strings.Contains(content, keyword) {
			return true
		}
	}

	return false
}

type NotificationActionRecord struct {
	ID             uuid.UUID          `json:"id" bson:"_id"`
	NotificationID uuid.UUID          `json:"notification_id" bson:"notification_id" binding:"required"`
	DeviceID       uuid.UUID          `json:"device_id" bson:"device_id" binding:"required"`
	ActionType     NotificationAction `json:"action_type" bson:"action_type" binding:"required"`
	Timestamp      time.Time          `json:"timestamp" bson:"timestamp"`
}

// Validate performs validation on the notification action record
func (nar *NotificationActionRecord) Validate() error {
	if nar.NotificationID == uuid.Nil {
		return fmt.Errorf("notification_id is required")
	}

	if nar.DeviceID == uuid.Nil {
		return fmt.Errorf("device_id is required")
	}

	if !nar.ActionType.IsValid() {
		return fmt.Errorf("invalid action_type: %s", nar.ActionType)
	}

	return nil
}

// SetDefaults sets default values for the notification action record
func (nar *NotificationActionRecord) SetDefaults() {
	if nar.Timestamp.IsZero() {
		nar.Timestamp = time.Now()
	}
}

type SyncMessage struct {
	Type           string      `json:"type" binding:"required"`
	NotificationID uuid.UUID   `json:"notification_id" binding:"required"`
	Action         string      `json:"action" binding:"required"`
	Data           interface{} `json:"data,omitempty"`
	Timestamp      time.Time   `json:"timestamp"`
}

// Validate performs validation on the sync message
func (sm *SyncMessage) Validate() error {
	if strings.TrimSpace(sm.Type) == "" {
		return fmt.Errorf("type is required")
	}

	if sm.NotificationID == uuid.Nil {
		return fmt.Errorf("notification_id is required")
	}

	if strings.TrimSpace(sm.Action) == "" {
		return fmt.Errorf("action is required")
	}

	return nil
}

// SetDefaults sets default values for the sync message
func (sm *SyncMessage) SetDefaults() {
	if sm.Timestamp.IsZero() {
		sm.Timestamp = time.Now()
	}
}

// CreateNotificationRequest represents the request to create a new notification
type CreateNotificationRequest struct {
	AppName  string               `json:"app_name" binding:"required,max=255"`
	Title    string               `json:"title" binding:"max=500"`
	Body     string               `json:"body" binding:"max=2000"`
	Category NotificationCategory `json:"category,omitempty"`
	Priority int                  `json:"priority,omitempty" binding:"min=0,max=3"`
}

// Validate performs validation on the create notification request
func (cnr *CreateNotificationRequest) Validate() error {
	if strings.TrimSpace(cnr.AppName) == "" {
		return fmt.Errorf("app_name is required")
	}

	if len(cnr.AppName) > 255 {
		return fmt.Errorf("app_name must be 255 characters or less")
	}

	if len(cnr.Title) > 500 {
		return fmt.Errorf("title must be 500 characters or less")
	}

	if len(cnr.Body) > 2000 {
		return fmt.Errorf("body must be 2000 characters or less")
	}

	if cnr.Category != "" && !cnr.Category.IsValid() {
		return fmt.Errorf("invalid category: %s", cnr.Category)
	}

	if cnr.Priority != 0 && !NotificationPriority(cnr.Priority).IsValid() {
		return fmt.Errorf("priority must be between 0 and 3")
	}

	return nil
}

// ToNotification converts the request to a notification with user and device context
func (cnr *CreateNotificationRequest) ToNotification(userID, deviceID uuid.UUID) *Notification {
	notification := &Notification{
		UserID:         userID,
		SourceDeviceID: deviceID,
		AppName:        cnr.AppName,
		Title:          cnr.Title,
		Body:           cnr.Body,
		Category:       cnr.Category,
		Priority:       cnr.Priority,
	}

	notification.SetDefaults()
	return notification
}

// UpdateNotificationStatusRequest represents the request to update notification status
type UpdateNotificationStatusRequest struct {
	Action NotificationAction `json:"action" binding:"required"`
}

// Validate performs validation on the update notification status request
func (unsr *UpdateNotificationStatusRequest) Validate() error {
	if !unsr.Action.IsValid() {
		return fmt.Errorf("invalid action: %s", unsr.Action)
	}

	return nil
}