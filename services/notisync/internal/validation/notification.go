package validation

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/notisync/backend/internal/types"
)

// NotificationValidator provides validation logic for notifications
type NotificationValidator struct {
	// Configuration for validation rules
	maxTitleLength int
	maxBodyLength  int
	maxAppNameLength int
}

// NewNotificationValidator creates a new notification validator
func NewNotificationValidator() *NotificationValidator {
	return &NotificationValidator{
		maxTitleLength:   500,
		maxBodyLength:    2000,
		maxAppNameLength: 255,
	}
}

// ValidateNotification performs comprehensive validation on a notification
func (v *NotificationValidator) ValidateNotification(notification *types.Notification) error {
	if err := v.validateRequired(notification); err != nil {
		return err
	}

	if err := v.validateLengths(notification); err != nil {
		return err
	}

	if err := v.validateContent(notification); err != nil {
		return err
	}

	return nil
}

// ValidateCreateRequest validates a create notification request
func (v *NotificationValidator) ValidateCreateRequest(req *types.CreateNotificationRequest) error {
	if err := req.Validate(); err != nil {
		return err
	}

	// Additional business logic validation
	if err := v.validateAppName(req.AppName); err != nil {
		return err
	}

	if err := v.validateNotificationContent(req.Title, req.Body); err != nil {
		return err
	}

	return nil
}

// validateRequired checks that required fields are present
func (v *NotificationValidator) validateRequired(notification *types.Notification) error {
	if notification.UserID.String() == "00000000-0000-0000-0000-000000000000" {
		return fmt.Errorf("user_id is required")
	}

	if notification.SourceDeviceID.String() == "00000000-0000-0000-0000-000000000000" {
		return fmt.Errorf("source_device_id is required")
	}

	if strings.TrimSpace(notification.AppName) == "" {
		return fmt.Errorf("app_name is required")
	}

	return nil
}

// validateLengths checks field length constraints
func (v *NotificationValidator) validateLengths(notification *types.Notification) error {
	if len(notification.AppName) > v.maxAppNameLength {
		return fmt.Errorf("app_name exceeds maximum length of %d characters", v.maxAppNameLength)
	}

	if len(notification.Title) > v.maxTitleLength {
		return fmt.Errorf("title exceeds maximum length of %d characters", v.maxTitleLength)
	}

	if len(notification.Body) > v.maxBodyLength {
		return fmt.Errorf("body exceeds maximum length of %d characters", v.maxBodyLength)
	}

	return nil
}

// validateContent performs content-based validation
func (v *NotificationValidator) validateContent(notification *types.Notification) error {
	// Check for potentially malicious content
	if v.containsSuspiciousContent(notification.Title) || v.containsSuspiciousContent(notification.Body) {
		return fmt.Errorf("notification content contains suspicious patterns")
	}

	// Validate that at least title or body is present
	if strings.TrimSpace(notification.Title) == "" && strings.TrimSpace(notification.Body) == "" {
		return fmt.Errorf("notification must have either title or body")
	}

	return nil
}

// validateAppName validates the app name format and content
func (v *NotificationValidator) validateAppName(appName string) error {
	// Check for valid app name format (alphanumeric, spaces, dots, hyphens, underscores)
	validAppName := regexp.MustCompile(`^[a-zA-Z0-9\s\.\-_]+$`)
	if !validAppName.MatchString(appName) {
		return fmt.Errorf("app_name contains invalid characters")
	}

	// Check for reserved app names
	reservedNames := []string{"system", "admin", "root", "notisync"}
	for _, reserved := range reservedNames {
		if strings.EqualFold(appName, reserved) {
			return fmt.Errorf("app_name '%s' is reserved", appName)
		}
	}

	return nil
}

// validateNotificationContent validates title and body content
func (v *NotificationValidator) validateNotificationContent(title, body string) error {
	// Check for empty content
	if strings.TrimSpace(title) == "" && strings.TrimSpace(body) == "" {
		return fmt.Errorf("notification must have either title or body")
	}

	// Check for suspicious patterns
	if v.containsSuspiciousContent(title) || v.containsSuspiciousContent(body) {
		return fmt.Errorf("notification content contains suspicious patterns")
	}

	return nil
}

// containsSuspiciousContent checks for potentially malicious content
func (v *NotificationValidator) containsSuspiciousContent(content string) bool {
	suspiciousPatterns := []string{
		"<script", "</script>", "javascript:", "onclick=", "onerror=",
		"eval(", "document.cookie", "window.location", "alert(",
	}

	lowerContent := strings.ToLower(content)
	for _, pattern := range suspiciousPatterns {
		if strings.Contains(lowerContent, pattern) {
			return true
		}
	}

	return false
}

// SanitizeNotification sanitizes notification content
func (v *NotificationValidator) SanitizeNotification(notification *types.Notification) {
	notification.AppName = v.sanitizeString(notification.AppName)
	notification.Title = v.sanitizeString(notification.Title)
	notification.Body = v.sanitizeString(notification.Body)
}

// sanitizeString removes potentially harmful content from strings
func (v *NotificationValidator) sanitizeString(input string) string {
	// Remove HTML tags
	htmlTagRegex := regexp.MustCompile(`<[^>]*>`)
	sanitized := htmlTagRegex.ReplaceAllString(input, "")

	// Remove excessive whitespace
	whitespaceRegex := regexp.MustCompile(`\s+`)
	sanitized = whitespaceRegex.ReplaceAllString(sanitized, " ")

	// Trim whitespace
	sanitized = strings.TrimSpace(sanitized)

	return sanitized
}

// ValidateNotificationAction validates a notification action
func (v *NotificationValidator) ValidateNotificationAction(action types.NotificationAction) error {
	if !action.IsValid() {
		return fmt.Errorf("invalid notification action: %s", action)
	}

	return nil
}

// ValidateNotificationCategory validates a notification category
func (v *NotificationValidator) ValidateNotificationCategory(category types.NotificationCategory) error {
	if category != "" && !category.IsValid() {
		return fmt.Errorf("invalid notification category: %s", category)
	}

	return nil
}

// ValidateNotificationPriority validates a notification priority
func (v *NotificationValidator) ValidateNotificationPriority(priority int) error {
	if !types.NotificationPriority(priority).IsValid() {
		return fmt.Errorf("invalid notification priority: %d (must be 0-3)", priority)
	}

	return nil
}